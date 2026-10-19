// Domain helpers. Framework-neutral: they throw plain Errors, so both Vitest and Playwright use them.
import { randomBytes } from 'node:crypto';
import { api, raw, sleep, type Res } from './http.ts';
import { LENIENT_SETUP } from './config.ts';

export interface Link {
  code: string;
  url: string;
  shortUrl: string;
  isCustom: boolean;
  createdAt: string;
  clickCount: number;
  lastClickedAt: string | null;
}
export interface Breakdown {
  name: string;
  clicks: number;
}
export interface Stats {
  code: string;
  days: number;
  totalClicks: number;
  rangeClicks: number;
  daily: { date: string; clicks: number }[];
  topReferrers: Breakdown[];
  topCountries: Breakdown[];
  devices: Breakdown[];
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Random lower-case alphanumeric token. */
export function uid(n = 10): string {
  const b = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALNUM[b[i] % ALNUM.length];
  return s;
}
/** A unique alias: `${prefix}-${random}`. Always matches R-ALIAS-1 when prefix is [A-Za-z0-9_-]. */
export function alias(prefix = 'h'): string {
  return `${prefix}-${uid(10)}`;
}
/** A unique destination URL (already in WHATWG-serialized form). */
export function uurl(tag = 'x'): string {
  return `https://example.com/${tag}/${uid(12)}`;
}
export const enc = encodeURIComponent;

export function create(body: unknown, opts: { base?: string } = {}): Promise<Res> {
  return api('POST', '/api/links', { json: body, base: opts.base });
}

/** Create a link and insist on 201. `base` targets another api instance (a spawned one). */
export async function createOk(body: { url: string; alias?: string | null; [k: string]: unknown }, opts: { base?: string } = {}): Promise<Link> {
  const r = await create(body, opts);
  const what = `setup: POST /api/links ${JSON.stringify(body).slice(0, 200)}`;
  if (r.status !== 201) throw new Error(`${what} -> ${r.status} ${r.text.slice(0, 300)}`);
  const l = r.json as Link;
  if (LENIENT_SETUP) return l;
  // A created link must echo what was asked for (R-LINK-2, R-URL-5); otherwise later assertions are meaningless.
  const want = whatwg(body.url.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ''));
  if (l?.url !== want) throw new Error(`${what} -> url ${JSON.stringify(l?.url)}, expected ${JSON.stringify(want)}`);
  if (typeof body.alias === 'string' && body.alias !== '' && l.code !== body.alias) {
    throw new Error(`${what} -> code ${JSON.stringify(l.code)}, expected the alias`);
  }
  return l;
}

export function getLink(code: string): Promise<Res> {
  return api('GET', `/api/links/${enc(code)}`);
}
export async function getLinkOk(code: string): Promise<Link> {
  const r = await getLink(code);
  if (r.status !== 200) throw new Error(`GET /api/links/${code} -> ${r.status} ${r.text.slice(0, 200)}`);
  return r.json as Link;
}
export function getStats(code: string, query = ''): Promise<Res> {
  return api('GET', `/api/links/${enc(code)}/stats${query}`);
}
export async function getStatsOk(code: string, query = ''): Promise<Stats> {
  const r = await getStats(code, query);
  if (r.status !== 200) throw new Error(`GET /api/links/${code}/stats${query} -> ${r.status} ${r.text.slice(0, 200)}`);
  return r.json as Stats;
}
export function del(code: string): Promise<Res> {
  return api('DELETE', `/api/links/${enc(code)}`);
}

/** GET /{code} (never followed) with optional extra headers. */
export function follow(code: string, headers: Record<string, string> = {}, query = ''): Promise<Res> {
  return api('GET', `/${enc(code)}${query}`, { headers });
}
/** GET /{code} over node:http with a raw header list (duplicates, no UA, raw bytes). */
export function followRaw(code: string, headers: string[], omit: string[] = []): Promise<Res> {
  return raw('GET', `/${enc(code)}`, { headers, omit });
}

/**
 * R-REDIR-4 polling: poll GET /api/links/{code} until clickCount === expected.
 * Fails if not visible by `deadlineMs` after `since` (performance.now() of the redirect's headers).
 */
export async function waitForClickCount(code: string, expected: number, since: number, deadlineMs = 2500): Promise<Link> {
  let last: Link | undefined;
  for (;;) {
    last = await getLinkOk(code);
    if (last.clickCount === expected) return last;
    if (last.clickCount > expected) throw new Error(`clickCount for ${code} is ${last.clickCount}, more than the expected ${expected}`);
    if (performance.now() - since > deadlineMs) {
      throw new Error(`clickCount for ${code} is ${last.clickCount}, expected ${expected} within ${deadlineMs} ms of the redirect`);
    }
    await sleep(100);
  }
}

/** Poll stats until rangeClicks === expected (same deadline semantics). */
export async function waitForRangeClicks(code: string, expected: number, since: number, query = '', deadlineMs = 2500): Promise<Stats> {
  for (;;) {
    const s = await getStatsOk(code, query);
    if (s.rangeClicks === expected) return s;
    if (s.rangeClicks > expected) throw new Error(`rangeClicks for ${code} is ${s.rangeClicks}, more than the expected ${expected}`);
    if (performance.now() - since > deadlineMs) {
      throw new Error(`rangeClicks for ${code} is ${s.rangeClicks}, expected ${expected} within ${deadlineMs} ms of the last redirect`);
    }
    await sleep(100);
  }
}

/** Sleep until `ms` after `since` (a performance.now() timestamp). */
export async function sleepUntil(since: number, ms: number): Promise<void> {
  const left = since + ms - performance.now();
  if (left > 0) await sleep(left);
}

/**
 * Create a link, send exactly one redirect with the given headers, wait until the click is
 * visible, and return the stats. Used by the R-CLICK tests (one link per input, so the
 * breakdown has exactly one entry).
 */
export async function oneClick(send: (code: string) => Promise<Res>): Promise<Stats> {
  const link = await createOk({ url: uurl('click') });
  const r = await send(link.code);
  if (r.status !== 302) throw new Error(`redirect for ${link.code} -> ${r.status}`);
  return waitForRangeClicks(link.code, 1, r.headersAt);
}

/** Run async jobs with a concurrency limit; returns results in input order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Page GET /api/links?limit=100 forward until every wanted code is found (SPEC Scheduling rule),
 * bounded by the largest `total` seen. Returns the codes in the order the api listed them
 * (first occurrence wins, so a shifted page can't reorder them).
 */
export async function findInList(wanted: string[]): Promise<{ order: string[]; items: Map<string, Link> }> {
  const want = new Set(wanted);
  const order: string[] = [];
  const items = new Map<string, Link>();
  let offset = 0;
  let bound = Infinity;
  while (offset < bound && items.size < want.size) {
    const r = await api('GET', `/api/links?limit=100&offset=${offset}`);
    if (r.status !== 200) throw new Error(`GET /api/links -> ${r.status}`);
    const page = r.json as { items: Link[]; total: number };
    bound = bound === Infinity ? page.total : Math.max(bound, page.total);
    for (const it of page.items) {
      if (want.has(it.code) && !items.has(it.code)) {
        items.set(it.code, it);
        order.push(it.code);
      }
    }
    if (page.items.length === 0) break;
    offset += 100;
  }
  return { order, items };
}

/** RFC 3339 UTC "Z" timestamp with at most 6 fractional digits (SPEC "Timestamps"). */
export const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

/** Parse a SPEC timestamp to microseconds since the epoch (exact; JS Date is only ms). */
export function micros(ts: string): bigint {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(ts);
  if (!m) throw new Error(`not a SPEC timestamp: ${ts}`);
  const secs = BigInt(Date.parse(m[1] + 'Z')) / 1000n;
  const frac = BigInt((m[2] ?? '').padEnd(6, '0') || '0');
  return secs * 1_000_000n + frac;
}

/** Add n days to a YYYY-MM-DD date. */
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The WHATWG serialization of a URL string (Node's URL implements the WHATWG URL Standard). */
export function whatwg(s: string): string {
  return new URL(s).href;
}

/** Reserved aliases (R-ALIAS-2). */
export const RESERVED = ['api', 'healthz', 'docs', 'admin', 'static', 'assets', 'login', 'logout'];

/**
 * Run `fn(today)` anchored to a server "today" read by `readToday` (stats daily[last].date or
 * database now()). If today changed while it ran (a run spanning midnight UTC), retry once from
 * the start (SPEC "Time").
 */
export async function retryIfDayChanged<T>(readToday: () => Promise<string>, fn: (today: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const today = await readToday();
    try {
      const result = await fn(today);
      if ((await readToday()) === today || attempt > 0) return result;
    } catch (e) {
      if (attempt === 0 && (await readToday()) !== today) continue;
      throw e;
    }
  }
}

/** "Today" per the api: the date of the last daily entry of any link's stats. */
export async function apiToday(code: string): Promise<string> {
  const s = await getStatsOk(code, '?days=1');
  return s.daily[s.daily.length - 1].date;
}

/** Lazily create a shared fixture on first use (so a setup failure fails each test, not skips it). */
export function lazy<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => (p ??= fn().catch((e) => ((p = undefined), Promise.reject(e))));
}
