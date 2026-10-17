// Spawned-instance gray-box tests. The harness starts its own api process from API_BIN with
// DATABASE_URL pointing at a harness-owned TCP listener it controls. Skips when API_BIN is unset.
import net from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import { DATABASE_URL, GRAY_SKIP, SPAWN_SKIP, hasBin, hasDb } from '../../lib/config.ts';
import { api, sleep, type Res } from '../../lib/http.ts';
import { uid, uurl } from '../../lib/links.ts';
import { expectError } from '../../lib/assert.ts';
import { addressForms } from '../../lib/addr.ts';
import { TcpProxy, dbTarget, freePort, startApi, viaPort, waitForPort, type Instance } from '../../lib/spawn.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!().catch(() => {});
});

async function healthz(inst: Instance): Promise<Res> {
  return api('GET', '/healthz', { base: inst.base });
}

async function pollHealth(inst: Instance, want: number, ms: number): Promise<Res> {
  const t0 = performance.now();
  for (;;) {
    const r = await healthz(inst);
    if (r.status === want) return r;
    if (performance.now() - t0 > ms) throw new Error(`healthz stayed ${r.status}, wanted ${want} within ${ms} ms`);
    await sleep(250);
  }
}

describe('spawned api instance (gray-box)', () => {
  test('[R-HEALTH-1][gray-box] database accepts TCP but never responds -> 503 unavailable within 3 s', async (ctx) => {
    ctx.skip(!hasBin, SPAWN_SKIP);
    const hole = new TcpProxy('blackhole');
    const port = await hole.listen();
    cleanups.push(() => hole.close());
    const inst = await startApi(`postgres://harness:harness@127.0.0.1:${port}/shortlink`);
    cleanups.push(() => inst.stop());
    await waitForPort(inst.port, 10_000);
    for (let i = 0; i < 2; i++) {
      const r = await healthz(inst);
      expect(r.ms).toBeLessThan(3000);
      expectError(r, 503, 'unavailable');
    }
  });

  test('[R-HEALTH-2][gray-box] with the database unreachable at startup the api opens its port within 10 s, serves /healthz and keeps running', async (ctx) => {
    ctx.skip(!hasBin, SPAWN_SKIP);
    const closed = await freePort(); // nothing listens here: connection refused
    const inst = await startApi(`postgres://harness:harness@127.0.0.1:${closed}/shortlink`);
    cleanups.push(() => inst.stop());
    await waitForPort(inst.port, 10_000);
    const r = await healthz(inst);
    expect(r.ms).toBeLessThan(3000);
    expectError(r, 503, 'unavailable');
    await sleep(3000);
    expect(inst.exited(), 'api exited after failing to reach the database').toBe(false);
    expectError(await healthz(inst), 503, 'unavailable');
  });

  test('[R-HEALTH-2][gray-box] once the database becomes reachable the api recovers (migrations applied, links work)', async (ctx) => {
    ctx.skip(!hasBin, SPAWN_SKIP);
    ctx.skip(!hasDb, GRAY_SKIP);
    const proxy = new TcpProxy('refuse', dbTarget(DATABASE_URL!));
    const port = await proxy.listen();
    cleanups.push(() => proxy.close());
    const inst = await startApi(viaPort(DATABASE_URL!, port));
    cleanups.push(() => inst.stop());
    await waitForPort(inst.port, 10_000);
    expectError(await healthz(inst), 503, 'unavailable');
    proxy.setMode('forward');
    const ok = await pollHealth(inst, 200, 30_000);
    expect(ok.json).toEqual({ status: 'ok' });
    const c = await api('POST', '/api/links', { base: inst.base, json: { url: uurl('h2'), alias: `h2-${uid()}` } });
    expect(c.status, c.text).toBe(201);
    expect(inst.exited()).toBe(false);
  });

  test('[R-HEALTH-3][R-HEALTH-1][gray-box] the health check queries the database on every request (no cached result)', async (ctx) => {
    ctx.skip(!hasBin, SPAWN_SKIP);
    ctx.skip(!hasDb, GRAY_SKIP);
    const proxy = new TcpProxy('forward', dbTarget(DATABASE_URL!));
    const port = await proxy.listen();
    cleanups.push(() => proxy.close());
    const inst = await startApi(viaPort(DATABASE_URL!, port));
    cleanups.push(() => inst.stop());
    await waitForPort(inst.port, 10_000);
    await pollHealth(inst, 200, 30_000);
    expect((await healthz(inst)).status).toBe(200);
    proxy.setMode('blackhole');
    const down = await healthz(inst);
    expect(down.ms).toBeLessThan(3000);
    expectError(down, 503, 'unavailable');
    proxy.setMode('forward');
    await pollHealth(inst, 200, 15_000);
  });

  test('[R-PRIV-1][gray-box] api stdout/stderr after the first request never contain the client address', async (ctx) => {
    ctx.skip(!hasBin, SPAWN_SKIP);
    ctx.skip(!hasDb, GRAY_SKIP);
    const inst = await startApi(DATABASE_URL!);
    cleanups.push(() => inst.stop());
    await waitForPort(inst.port, 10_000);
    await pollHealth(inst, 200, 30_000);
    // Determine the address the api sees for us.
    const addr = await new Promise<string>((resolve, reject) => {
      const s = net.connect({ host: '127.0.0.1', port: inst.port }, () => (resolve(s.localAddress!), s.destroy()));
      s.on('error', reject);
    });
    const firstRequestAt = performance.now();
    const base = inst.base.replace('localhost', '127.0.0.1');
    const c = await api('POST', '/api/links', { base, json: { url: uurl('priv') } });
    expect(c.status).toBe(201);
    const code = c.json.code;
    await api('GET', `/${code}`, { base, headers: { referer: 'https://example.com/' } });
    await api('GET', `/nope-${uid()}`, { base });
    await api('GET', `/api/links/nope-${uid()}`, { base });
    await api('POST', '/api/links', { base, body: '{' });
    await api('GET', `/api/links/${code}/stats`, { base });
    await sleep(2500);
    const forms = addressForms(addr);
    const after = inst.lines.filter((l) => l.at >= firstRequestAt).map((l) => l.text);
    for (const line of after) for (const f of forms) expect(line, `log line contains client address ${f}`).not.toContain(f);
    await ctx.annotate(`R-PRIV-1: searched ${after.length} log lines for ${forms.join(', ')}`);
  });
});
