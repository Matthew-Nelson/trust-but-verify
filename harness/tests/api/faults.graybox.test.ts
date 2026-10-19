// Fault-injection gray-box tests for R-REDIR-6 and R-ERR-7.
//
// Both rules are labelled (mutant-verified) in SPEC, and no ordinary request makes an api record a
// click unsuccessfully or hit an internal error. These tests cause the condition deliberately: the
// harness spawns its own api instance from API_BIN, with DATABASE_URL pointing at a harness-owned
// PostgreSQL protocol proxy (lib/pgproxy.ts) in front of the real database. Once the instance is
// healthy and has served normal requests, the proxy makes that instance's own database sessions
// read-only (and, for R-ERR-7, also unable to resolve unqualified table names). Nothing in the shared
// database changes, no other test's requests reach the instance, and afterEach stops the instance and
// closes the proxy whether or not the test failed.
//
// SPEC spec-v1.5 grants exactly this: Verification rules, "Configuration" (API_BIN instances for the
// R-ERR-7 and R-REDIR-6 fault-injection tests) and "Fault injection" (the proxy and the two SET
// statements); R-REDIR-6 defines "normal latency". The tests skip only when API_BIN or DATABASE_URL
// is unset, and report inconclusive, never passed, when the fault cannot be shown to have taken effect.
import { afterEach, describe, expect, test, type TestContext } from 'vitest';
import { DATABASE_URL, GRAY_SKIP, SPAWN_SKIP, hasBin, hasDb } from '../../lib/config.ts';
import { ContractViolation, api, raw, sleep, type Res } from '../../lib/http.ts';
import { alias, createOk, enc, sleepUntil, uurl } from '../../lib/links.ts';
import { linkExists, storedClicks } from '../../lib/db.ts';
import { dbTarget, startApi, viaPort, waitForPort, type Instance } from '../../lib/spawn.ts';
import { FAULT_READ_ONLY, FAULT_READ_ONLY_NO_SCHEMA, PgFaultProxy } from '../../lib/pgproxy.ts';

const CANONICAL_500 = { error: { code: 'internal', message: 'Internal server error.' } };

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  // LIFO: the api instance stops first, then the proxy closes. Runs on failure and timeout too.
  while (cleanups.length) await cleanups.pop()!().catch(() => {});
});

/** Skip at runtime as inconclusive: the fault could not be shown to have the intended effect. */
async function inconclusive(ctx: TestContext, why: string): Promise<never> {
  const note = `inconclusive (gray-box): ${why}`;
  await ctx.annotate(note);
  ctx.skip(note);
  throw new Error(note); // not reached: skip() throws
}

/**
 * Start a proxy in forwarding mode and an api instance behind it, and wait until the instance is
 * healthy. Fails (not skips) if the instance never becomes healthy or never opens a database session
 * through the proxy, because an API_BIN instance must honor DATABASE_URL (SPEC Configuration).
 */
async function faultableInstance(): Promise<{ inst: Instance; proxy: PgFaultProxy }> {
  const proxy = new PgFaultProxy(dbTarget(DATABASE_URL!));
  const port = await proxy.listen();
  cleanups.push(() => proxy.close());
  const inst = await startApi(viaPort(DATABASE_URL!, port));
  cleanups.push(() => inst.stop());
  await waitForPort(inst.port, 10_000);
  const t0 = performance.now();
  for (;;) {
    const r = await api('GET', '/healthz', { base: inst.base });
    if (r.status === 200) break;
    if (performance.now() - t0 > 30_000) {
      throw new Error(
        `setup: the spawned api did not become healthy through the harness proxy within 30 s (last /healthz ${r.status}); ` +
          `database errors seen by the proxy: ${proxy.startupErrors.join(' | ') || 'none'}. The proxy declines TLS, so the ` +
          `database must accept an unencrypted connection (SPEC Verification rules, "Fault injection").`,
      );
    }
    await sleep(250);
  }
  expect(proxy.readySessions, 'the spawned api answered /healthz 200 without ever opening a database session through DATABASE_URL').toBeGreaterThan(0);
  return { inst, proxy };
}

/** Apply a session fault and wait until every live session of the instance has it. */
async function applyFault(ctx: TestContext, proxy: PgFaultProxy, sql: string): Promise<void> {
  proxy.apply(sql);
  const s = await proxy.settled(5000);
  if (!s.ok) {
    await inconclusive(
      ctx,
      `could not apply "${sql}" to every database session of the spawned api within 5 s ` +
        `(${s.sessions} sessions, ${s.lagging} never idle between transactions, ${s.failed} rejected it, ${s.opaque} unframeable/TLS; ` +
        `errors: ${proxy.injectErrors.join(' | ') || 'none'}).`,
    );
  }
}

/** One request with its latency; a transport failure or timeout is recorded, not thrown. */
interface Timed {
  label: string;
  res?: Res;
  status: number;
  ms: number;
  error?: string;
}
async function timed(label: string, fn: () => Promise<Res>): Promise<Timed> {
  const t0 = performance.now();
  try {
    const res = await fn();
    return { label, res, status: res.status, ms: res.ms };
  } catch (e) {
    if (e instanceof ContractViolation) throw e; // R-ERR-1/4/7 checks in lib/http.ts fail the test
    return { label, status: 0, ms: performance.now() - t0, error: String(e) };
  }
}

/** Poll the stored click rows (R-REDIR-4: visible 2 s after the redirect; 2.5 s deadline). */
async function waitForStored(code: string, n: number, since: number): Promise<void> {
  for (;;) {
    const got = await storedClicks(code);
    if (got === n) return;
    if (got > n) throw new Error(`${got} click rows stored for ${code}, more than the ${n} redirects sent`);
    if (performance.now() - since > 2500) {
      throw new Error(`${got} click rows stored for ${code}, expected ${n} within 2.5 s of the last redirect (recording must work before the fault)`);
    }
    await sleep(100);
  }
}

describe('database faults on a spawned api instance (gray-box)', () => {
  test(
    '[R-REDIR-6][gray-box] when recording a click fails (the instance\'s database sessions turned read-only), GET /{code} gives the same redirect as before, within normal latency',
    async (ctx) => {
      ctx.skip(!hasBin, SPAWN_SKIP);
      ctx.skip(!hasDb, GRAY_SKIP);

      const { inst, proxy } = await faultableInstance();
      const link = await createOk({ url: uurl('r6'), alias: alias('r6') }, { base: inst.base });
      const path = `/${enc(link.code)}`;
      const get = (label: string) => timed(label, () => raw('GET', path, { base: inst.base }));
      const head = (label: string) => timed(label, () => raw('HEAD', path, { base: inst.base }));
      const view = (t: Timed) => ({
        status: t.status,
        location: t.res?.headers['location'],
        cacheControl: t.res?.headers['cache-control'],
        contentType: t.res?.headers['content-type'],
        body: t.res?.text,
        error: t.error,
      });

      // 1. Normal behavior, recording working. One warm-up of each method is excluded from timing.
      await get('warm-up GET');
      await head('warm-up HEAD');
      const baseline: Timed[] = [];
      for (let i = 0; i < 10; i++) baseline.push(await get(`baseline GET ${i + 1}`));
      for (const b of baseline) {
        expect(b.status, `${b.label}: ${b.error ?? ''}`).toBe(302);
        expect(b.res!.headers['location'], b.label).toBe(link.url);
      }
      await waitForStored(link.code, 11, baseline[9].res!.headersAt);
      // The redirect response "it would otherwise get": status, Location and Cache-Control always; the
      // Content-Type and body too unless they already vary between normal redirects.
      const ref = view(baseline[0]);
      const varying = (['cacheControl', 'contentType', 'body'] as const).filter((k) => baseline.some((b) => view(b)[k] !== ref[k]));
      if (varying.includes('cacheControl')) {
        await inconclusive(ctx, `Cache-Control already differs between normal redirects (${[...new Set(baseline.map((b) => b.res!.headers['cache-control']))].join(' | ')}), so "equal those of the normal redirects" has no single value to compare with.`);
      }
      const compared = (t: Timed) => {
        const v: Record<string, unknown> = view(t);
        for (const k of varying) delete v[k];
        return v;
      };

      // 2. The fault: every database session of this instance becomes read-only, so the click
      //    write fails while the lookup still works.
      await applyFault(ctx, proxy, FAULT_READ_ONLY);
      const heads: Timed[] = [];
      const gets: Timed[] = [];
      for (let i = 0; i < 10; i++) {
        heads.push(await head(`fault HEAD ${i + 1}`)); // records nothing: a same-moment "normal latency" reference
        gets.push(await get(`fault GET ${i + 1}`));
      }
      const lastAt = Math.max(...gets.map((g) => g.res?.headersAt ?? performance.now()));
      await sleepUntil(lastAt, 2500);
      const stored = await storedClicks(link.code);

      // 3. Did the condition actually occur? If not, this run proves nothing either way.
      const restoredRw = proxy.restores.filter((r) => r.kind === 'read-write');
      if (restoredRw.length) {
        await inconclusive(ctx, `the api restored a read-write default on its own sessions after the fault was applied (${restoredRw.map((r) => JSON.stringify(r.sql)).join('; ')}), so per SPEC "Fault injection" this test is inconclusive.`);
      }
      if (stored !== 11) {
        await inconclusive(ctx, `${stored - 11} of the 10 redirects during the fault were still stored, so click recording did not fail (the api may override the session's read-only default).`);
      }
      const badHead = heads.filter((h) => h.status !== 302 || h.res?.headers['location'] !== link.url);
      if (badHead.length) {
        await inconclusive(
          ctx,
          `the fault also broke HEAD /{code}, which records nothing (${badHead.map((h) => `${h.label}: ${h.status}${h.error ? ' ' + h.error : ''}`).join('; ')}), so the fault was not limited to click recording.`,
        );
      }

      // 4. R-REDIR-6: the redirect response did not change ...
      await ctx.annotate(`R-REDIR-6: compared status, Location, Cache-Control${varying.includes('contentType') ? '' : ', Content-Type'}${varying.includes('body') ? '' : ', body'} with the redirect before the fault`);
      expect(gets.map(compared), 'a failure to record a click changed the redirect response').toEqual(gets.map(() => compared(baseline[0])));

      // ... and was not delayed beyond normal latency, as R-REDIR-6 defines it: B is the slowest of the 10
      // baseline GETs (same instance, link and client, clicks recorded successfully) and the 10 HEADs
      // interleaved with the GETs whose click fails; each such GET's headers must arrive within
      // max(4 x B, B + 1 s). A conforming api spends at most one extra failed statement on a failed click,
      // while any retry, backoff or timeout wait measured in seconds exceeds the bound whenever B < 1 s.
      const B = Math.max(...baseline.map((b) => b.ms), ...heads.map((h) => h.ms));
      const T = Math.max(4 * B, B + 1000);
      const ms = (xs: Timed[]) => xs.map((x) => Math.round(x.ms)).join(', ');
      await ctx.annotate(`R-REDIR-6: normal latency B = ${Math.round(B)} ms (baseline GET ms: ${ms(baseline)}; fault-phase HEAD ms: ${ms(heads)}); bound T = ${Math.round(T)} ms; fault GET ms: ${ms(gets)}`);
      const slow = gets.filter((g) => g.ms > T).map((g) => `${g.label}: ${Math.round(g.ms)} ms`);
      expect(slow, `a failure to record a click delayed the redirect beyond normal latency (bound ${Math.round(T)} ms, B ${Math.round(B)} ms)`).toEqual([]);
    },
    120_000,
  );

  test(
    '[R-ERR-7][gray-box] database failures on a spawned instance (writes rejected, then tables unresolvable): every 500 has exactly the canonical internal-error body',
    async (ctx) => {
      ctx.skip(!hasBin, SPAWN_SKIP);
      ctx.skip(!hasDb, GRAY_SKIP);

      const { inst, proxy } = await faultableInstance();
      const keep = await createOk({ url: uurl('e7'), alias: alias('e7') }, { base: inst.base });
      const k = enc(keep.code);
      const tries: Timed[] = [];
      const send = async (method: string, path: string, json?: unknown) => {
        const opts = json === undefined ? {} : { headers: ['Content-Type', 'application/json'], body: JSON.stringify(json) };
        tries.push(await timed(`${method} ${path}`, () => raw(method, path, { base: inst.base, timeoutMs: 10_000, ...opts })));
      };

      // Phase 1: read-only sessions. Every write the api attempts is rejected by the database.
      await applyFault(ctx, proxy, FAULT_READ_ONLY);
      const roAlias = alias('e7ro');
      await send('POST', '/api/links', { url: uurl('e7ro') });
      await send('POST', '/api/links', { url: uurl('e7ro'), alias: roAlias });
      await send('DELETE', `/api/links/${k}`);
      const writesHeld = (await linkExists(keep.code)) && !(await linkExists(roAlias));
      const roGeneration = proxy.generation;

      // Phase 2: also an empty search_path, so unqualified table names no longer resolve and reads fail too.
      await applyFault(ctx, proxy, FAULT_READ_ONLY_NO_SCHEMA);
      await send('GET', '/api/links');
      await send('GET', `/api/links/${k}`);
      await send('GET', `/api/links/${k}/stats`);
      await send('GET', `/${k}`); // R-ERR-7 covers every 500, including one on /{code}
      await send('POST', '/api/links', { url: uurl('e7ns') });
      await send('DELETE', `/api/links/${k}`);

      await ctx.annotate(`R-ERR-7: responses under the fault: ${tries.map((t) => `${t.label} -> ${t.status || t.error}`).join('; ')}`);
      const fives = tries.filter((t) => t.status === 500);
      for (const t of fives) {
        let body: unknown = t.res!.text;
        try {
          body = JSON.parse(t.res!.text);
        } catch {
          /* keep the raw text so the failure shows it */
        }
        expect(body, `${t.label} -> 500: body must be the canonical internal error (R-ERR-7)`).toStrictEqual(CANONICAL_500);
      }
      // SPEC "Fault injection": if the api restored a read-write default or a search path on its own
      // sessions, this test is inconclusive, never passed. A write that succeeded under read-only
      // sessions shows the same thing even if the statement that restored it was not recognized.
      const restored = proxy.restores.filter((r) => r.kind === 'read-write' || r.generation > roGeneration);
      if (restored.length || !writesHeld) {
        await inconclusive(
          ctx,
          `the api undid the fault on its own sessions (${[...restored.map((r) => `${r.kind}: ${JSON.stringify(r.sql)}`), ...(writesHeld ? [] : ['a write succeeded during the read-only phase'])].join('; ')}), so per SPEC "Fault injection" this test is inconclusive.`,
        );
      }
      if (fives.length === 0) {
        await inconclusive(ctx, 'no request under the database fault was answered with 500 (SPEC lets an api report a database error another way, e.g. 503 unavailable), so R-ERR-7 was not exercised.');
      }
    },
    120_000,
  );
});
