// Spawned-instance helpers for R-HEALTH-1 (503 branch), R-HEALTH-2, R-HEALTH-3 and R-PRIV-1 (logs).
// Only used when API_BIN is set.
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { API_BIN, COUNTRY_HEADER } from './config.ts';

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

export async function waitForPort(port: number, ms: number): Promise<number> {
  const t0 = performance.now();
  for (;;) {
    const ok = await new Promise<boolean>((r) => {
      const s = net.connect({ host: '127.0.0.1', port }, () => (s.destroy(), r(true)));
      s.on('error', () => r(false));
    });
    if (ok) return performance.now() - t0;
    if (performance.now() - t0 > ms) throw new Error(`port ${port} did not open within ${ms} ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

export interface Instance {
  port: number;
  base: string;
  proc: ChildProcess;
  /** Every stdout/stderr line with the time it arrived. */
  lines: { at: number; text: string }[];
  exited: () => boolean;
  stop: () => Promise<void>;
}

export async function startApi(databaseUrl: string): Promise<Instance> {
  if (!API_BIN) throw new Error('API_BIN is unset');
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const proc = spawn(API_BIN, [], {
    shell: /\s/.test(API_BIN),
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: String(port), PUBLIC_BASE_URL: base, COUNTRY_HEADER },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines: { at: number; text: string }[] = [];
  let exited = false;
  proc.on('exit', () => (exited = true));
  for (const stream of [proc.stdout!, proc.stderr!]) {
    let buf = '';
    stream.on('data', (c: Buffer) => {
      buf += c.toString('utf8');
      const parts = buf.split('\n');
      buf = parts.pop()!;
      for (const p of parts) lines.push({ at: performance.now(), text: p });
    });
  }
  return {
    port,
    base,
    proc,
    lines,
    exited: () => exited,
    stop: async () => {
      if (exited) return;
      proc.kill('SIGTERM');
      await new Promise((r) => {
        const t = setTimeout(() => (proc.kill('SIGKILL'), r(null)), 3000);
        proc.on('exit', () => (clearTimeout(t), r(null)));
      });
    },
  };
}

export type ProxyMode = 'refuse' | 'blackhole' | 'forward';

/**
 * A harness-owned TCP listener standing in for Postgres.
 * - refuse:    accept and immediately close every connection
 * - blackhole: accept and never respond; existing forwarded connections are unpiped and frozen too
 * - forward:   pipe to the real database
 */
export class TcpProxy {
  private server = net.createServer((c) => this.onConn(c));
  private conns = new Set<{ client: net.Socket; upstream?: net.Socket }>();
  mode: ProxyMode;
  port = 0;
  constructor(mode: ProxyMode, private target?: { host: string; port: number }) {
    this.mode = mode;
  }
  async listen(): Promise<number> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', () => r()));
    this.port = (this.server.address() as net.AddressInfo).port;
    return this.port;
  }
  setMode(mode: ProxyMode): void {
    const prev = this.mode;
    this.mode = mode;
    for (const c of this.conns) {
      if (mode === 'blackhole') {
        // unpipe() both directions first: a piped source is resumed on the destination's 'drain',
        // which would silently re-enable forwarding.
        if (c.upstream) {
          c.client.unpipe(c.upstream);
          c.upstream.unpipe(c.client);
          c.upstream.pause();
        }
        c.client.pause();
      } else if (prev === 'blackhole') {
        // Drop frozen connections so the api's pool reconnects cleanly.
        c.client.destroy();
        c.upstream?.destroy();
        this.conns.delete(c);
      }
    }
  }
  private onConn(client: net.Socket): void {
    client.on('error', () => {});
    if (this.mode === 'refuse') return void client.destroy();
    const entry: { client: net.Socket; upstream?: net.Socket } = { client };
    this.conns.add(entry);
    client.on('close', () => this.conns.delete(entry));
    if (this.mode === 'blackhole') return void client.pause();
    const up = net.connect(this.target!);
    up.on('error', () => client.destroy());
    entry.upstream = up;
    client.pipe(up);
    up.pipe(client);
    up.on('close', () => client.destroy());
  }
  async close(): Promise<void> {
    for (const c of this.conns) {
      c.client.destroy();
      c.upstream?.destroy();
    }
    await new Promise((r) => this.server.close(() => r(null)));
  }
}

/** Rewrite a postgres:// URL to point at 127.0.0.1:port, keeping user, password, db and params. */
export function viaPort(databaseUrl: string, port: number): string {
  const u = new URL(databaseUrl);
  u.hostname = '127.0.0.1';
  u.port = String(port);
  return u.toString();
}

export function dbTarget(databaseUrl: string): { host: string; port: number } {
  const u = new URL(databaseUrl);
  return { host: u.hostname || 'localhost', port: Number(u.port || 5432) };
}
