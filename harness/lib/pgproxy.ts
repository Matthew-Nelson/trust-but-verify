// A harness-owned PostgreSQL wire-protocol proxy for fault injection on a spawned api instance
// (R-ERR-7, R-REDIR-6), implementing SPEC "Verification rules / Fault injection" (spec-v1.5).
//
// It sits between ONE harness-spawned api process and the database named by DATABASE_URL, the same
// placement as the R-HEALTH-3 TcpProxy, but it understands message framing so it can change the
// instance's own database sessions without touching any shared state:
//
// - It declines SSL and GSS encryption requests itself (replies 'N'), so the session is plaintext
//   and its messages can be framed. Everything else is forwarded unchanged.
// - apply(sql) runs `sql` (for example SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY) as a
//   simple Query on every current and future session, only when that session is idle between
//   transactions: the last ReadyForQuery said 'I', no request is outstanding (no sync point
//   awaiting its ReadyForQuery, no unfinished extended-protocol batch) and none is partly sent (no
//   unforwarded client bytes). The responses to the injected query are discarded, so the api never
//   sees them. Sessions opened later get the same statement as soon as their startup completes.
// - It records any statement the api sends after a fault took effect that would restore a
//   read-write default or a search path (SPEC: the affected test is then inconclusive).
//
// The effect is confined to the sessions of the one api process the test spawned, and ends when the
// test stops that process and closes the proxy. Nothing in the shared database is changed.
import net from 'node:net';

const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;
const CANCEL_REQUEST = 80877102;
/** Client messages that end a request cycle and produce exactly one ReadyForQuery. */
const SYNC_POINTS = new Set(['Q', 'S', 'F']);
/** Extended-protocol messages that open (or continue) a batch that only a Sync closes. */
const BATCH_MSGS = new Set(['P', 'B', 'D', 'E', 'C', 'H']);
/** Client SQL that would undo an applied fault (SPEC Fault injection: restoring a read-write default or a search path). */
const RESTORES: { kind: Restore['kind']; re: RegExp }[] = [
  { kind: 'read-write', re: /\bread\s+write\b|\b(default_)?transaction_read_only\b|\b(reset|discard)\s+all\b/i },
  { kind: 'search_path', re: /\bsearch_path\b|\b(reset|discard)\s+all\b/i },
];
export interface Restore {
  kind: 'read-write' | 'search_path';
  /** proxy.generation when the api sent it. */
  generation: number;
  sql: string;
}

function queryMessage(sql: string): Buffer {
  const body = Buffer.from(sql + '\0', 'utf8');
  const head = Buffer.alloc(5);
  head.write('Q', 0, 'latin1');
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}

/** The 'M' (message) field of an ErrorResponse/NoticeResponse payload. */
function errorText(msg: Buffer): string {
  const fields: Record<string, string> = {};
  let i = 5;
  while (i < msg.length && msg[i] !== 0) {
    const k = String.fromCharCode(msg[i]);
    const end = msg.indexOf(0, i + 1);
    if (end < 0) break;
    fields[k] = msg.subarray(i + 1, end).toString('utf8');
    i = end + 1;
  }
  return `${fields.C ?? '?'} ${fields.M ?? '(no message)'}`;
}

class Session {
  phase: 'initial' | 'typed' | 'opaque' | 'cancel' = 'initial';
  /** Completed startup (received the first ReadyForQuery). */
  ready = false;
  pendingSyncs = 0;
  openBatch = false;
  txStatus = '?';
  /** Injected queries whose responses are still to be swallowed. */
  swallow = 0;
  /** Generation of proxy.apply() this session has had applied (0 = none). */
  applied = 0;
  injecting = 0;
  injectFailed = false;
  private cbuf = Buffer.alloc(0);
  private bbuf = Buffer.alloc(0);
  private upstream: net.Socket;

  constructor(private proxy: PgFaultProxy, private client: net.Socket, target: { host: string; port: number }) {
    this.upstream = net.connect(target);
    this.upstream.on('error', () => this.client.destroy());
    this.client.on('error', () => this.upstream.destroy());
    this.upstream.on('close', () => this.client.destroy());
    this.client.on('close', () => {
      this.upstream.destroy();
      proxy.sessions.delete(this);
    });
    this.client.on('data', (c: Buffer) => this.onClient(c));
    this.upstream.on('data', (c: Buffer) => this.onBackend(c));
  }

  destroy(): void {
    this.client.destroy();
    this.upstream.destroy();
  }

  private onClient(chunk: Buffer): void {
    if (this.phase === 'opaque' || this.phase === 'cancel') return void this.upstream.write(chunk);
    this.cbuf = Buffer.concat([this.cbuf, chunk]);
    for (;;) {
      if (this.phase === 'opaque' || this.phase === 'cancel') {
        if (this.cbuf.length) this.upstream.write(this.cbuf);
        this.cbuf = Buffer.alloc(0);
        return;
      }
      if (this.phase === 'initial') {
        if (this.cbuf.length >= 1 && this.cbuf[0] === 0x16) {
          // Direct TLS (sslnegotiation=direct): cannot be framed. Pass through; the session is opaque.
          this.phase = 'opaque';
          this.proxy.opaqueSessions++;
          continue;
        }
        if (this.cbuf.length < 8) return;
        const len = this.cbuf.readInt32BE(0);
        const code = this.cbuf.readInt32BE(4);
        if (len < 8 || len > 100_000) {
          this.phase = 'opaque';
          this.proxy.opaqueSessions++;
          continue;
        }
        if (this.cbuf.length < len) return;
        const pkt = this.cbuf.subarray(0, len);
        this.cbuf = this.cbuf.subarray(len);
        if (code === SSL_REQUEST || code === GSSENC_REQUEST) {
          this.client.write('N'); // decline encryption; the client continues in plaintext
          continue;
        }
        this.upstream.write(pkt);
        if (code === CANCEL_REQUEST) {
          this.phase = 'cancel'; // a cancel connection carries nothing else
          continue;
        }
        if (code >> 16 === 3) {
          this.phase = 'typed';
          this.pendingSyncs = 1; // the startup cycle ends with ReadyForQuery
          continue;
        }
        this.phase = 'opaque';
        this.proxy.opaqueSessions++;
        continue;
      }
      // typed: forward whole messages only, so an injected query never lands inside one
      if (this.cbuf.length < 5) return;
      const len = this.cbuf.readInt32BE(1);
      if (this.cbuf.length < 1 + len) return;
      const msg = this.cbuf.subarray(0, 1 + len);
      this.cbuf = this.cbuf.subarray(1 + len);
      const type = String.fromCharCode(msg[0]);
      if ((type === 'Q' || type === 'P') && (this.applied || this.injecting)) this.scanRestore(type, msg);
      if (SYNC_POINTS.has(type)) {
        this.pendingSyncs++;
        if (type === 'S') this.openBatch = false;
      } else if (BATCH_MSGS.has(type)) {
        this.openBatch = true;
      }
      this.upstream.write(msg);
      if (!this.cbuf.length) this.maybeInject();
    }
  }

  /** Record SQL from the api that would restore a read-write default or a search path. */
  private scanRestore(type: string, msg: Buffer): void {
    // Q: sql\0. P: statement-name\0 sql\0 ...
    let body = msg.subarray(5);
    if (type === 'P') body = body.subarray(body.indexOf(0) + 1);
    const end = body.indexOf(0);
    const sql = body.subarray(0, end < 0 ? body.length : end).toString('utf8');
    for (const r of RESTORES) {
      if (r.re.test(sql)) this.proxy.restores.push({ kind: r.kind, generation: this.proxy.generation, sql: sql.slice(0, 160) });
    }
  }

  private onBackend(chunk: Buffer): void {
    if (this.phase === 'opaque' || this.phase === 'cancel') return void this.client.write(chunk);
    this.bbuf = Buffer.concat([this.bbuf, chunk]);
    for (;;) {
      if (this.bbuf.length < 5) return;
      const len = this.bbuf.readInt32BE(1);
      if (this.bbuf.length < 1 + len) return;
      const msg = this.bbuf.subarray(0, 1 + len);
      this.bbuf = this.bbuf.subarray(1 + len);
      const type = String.fromCharCode(msg[0]);
      if (this.swallow > 0) {
        // Responses to an injected query: never forwarded to the api.
        if (type === 'E') {
          this.injectFailed = true;
          this.proxy.injectErrors.push(errorText(msg));
        }
        if (type === 'Z') {
          this.swallow--;
          this.txStatus = String.fromCharCode(msg[5]);
          this.applied = this.injecting;
          this.injecting = 0;
          this.maybeInject();
        }
        continue;
      }
      if (type === 'E' && !this.ready) this.proxy.startupErrors.push(errorText(msg));
      if (type === 'Z') {
        this.pendingSyncs = Math.max(0, this.pendingSyncs - 1);
        this.txStatus = String.fromCharCode(msg[5]);
        if (!this.ready) {
          this.ready = true;
          this.proxy.readySessions++;
        }
      }
      this.client.write(msg);
      if (type === 'Z') this.maybeInject();
    }
  }

  /** Inject the proxy's current statement if this session lags behind and is idle between transactions. */
  maybeInject(): void {
    const p = this.proxy;
    if (!p.sql || this.applied >= p.generation || this.injecting) return;
    if (this.phase !== 'typed' || !this.ready || this.swallow > 0) return;
    if (this.pendingSyncs > 0 || this.openBatch || this.txStatus !== 'I' || this.cbuf.length) return;
    this.injecting = p.generation;
    this.swallow++;
    this.upstream.write(queryMessage(p.sql));
  }
}

export class PgFaultProxy {
  private server = net.createServer((c) => this.onConn(c));
  sessions = new Set<Session>();
  port = 0;
  generation = 0;
  sql: string | undefined;
  /** Sessions that ever completed startup through this proxy. */
  readySessions = 0;
  /** Sessions that could not be framed (direct TLS or an unknown first packet). */
  opaqueSessions = 0;
  startupErrors: string[] = [];
  injectErrors: string[] = [];
  /** Statements the api sent after a fault took effect that would undo it. */
  restores: Restore[] = [];

  constructor(private target: { host: string; port: number }) {}

  async listen(): Promise<number> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', () => r()));
    this.port = (this.server.address() as net.AddressInfo).port;
    return this.port;
  }

  private onConn(client: net.Socket): void {
    this.sessions.add(new Session(this, client, this.target));
  }

  /** Run `sql` once on every current and future session, each at its next idle point. */
  apply(sql: string): void {
    this.generation++;
    this.sql = sql;
    for (const s of this.sessions) s.maybeInject();
  }

  /**
   * Wait until every session that has completed startup has had the latest statement applied.
   * Sessions still starting up get it before their first query, so they don't count as lagging.
   */
  async settled(ms: number): Promise<{ ok: boolean; sessions: number; lagging: number; failed: number; opaque: number }> {
    const t0 = performance.now();
    for (;;) {
      const live = [...this.sessions].filter((s) => s.phase === 'typed' && s.ready);
      const lagging = live.filter((s) => s.applied < this.generation).length;
      const failed = live.filter((s) => s.injectFailed).length;
      const opaque = [...this.sessions].filter((s) => s.phase === 'opaque').length;
      const ok = lagging === 0 && failed === 0 && opaque === 0 && this.injectErrors.length === 0;
      if (ok || performance.now() - t0 > ms) return { ok, sessions: live.length, lagging, failed, opaque };
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  async close(): Promise<void> {
    for (const s of this.sessions) s.destroy();
    this.sessions.clear();
    await new Promise((r) => this.server.close(() => r(null)));
  }
}

/** The fault statements SPEC "Fault injection" allows. Each affects only the session it runs in. */
export const FAULT_READ_ONLY = 'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY';
export const FAULT_READ_ONLY_NO_SCHEMA = `${FAULT_READ_ONLY}; SET search_path TO ''`;
