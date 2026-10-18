// Vitest assertion helpers.
import { expect } from 'vitest';
import { PUBLIC_BASE_URL } from './config.ts';
import { FORBIDDEN_MESSAGE_PATTERNS, ERROR_CODES, mediaType, type Res } from './http.ts';
import { TS_RE, micros, type Link, type Stats } from './links.ts';

/** Two timestamps (or nulls) denote the same instant (SPEC "Timestamps": compared as instants). */
export function expectSameInstant(actual: string | null, expected: string | null, label = 'timestamp'): void {
  if (actual === null || expected === null) {
    expect(actual, label).toBe(expected);
    return;
  }
  expect(micros(actual), `${label}: ${actual} vs ${expected}`).toBe(micros(expected));
}

/** Same Link: every non-timestamp field equal, timestamps equal as instants. */
export function expectSameLink(actual: any, expected: Link): void {
  const { createdAt: ac, lastClickedAt: al, ...ar } = actual;
  const { createdAt: ec, lastClickedAt: el, ...er } = expected;
  expect(ar).toEqual(er);
  expectSameInstant(ac, ec, 'createdAt');
  expectSameInstant(al, el, 'lastClickedAt');
}

/**
 * R-ERR-1 envelope + status + code, plus R-ERR-4: the message contains none of `supplied`
 * (request-supplied values) and matches none of the forbidden patterns.
 */
export function expectError(res: Res, status: number, code: string, supplied: string[] = []): void {
  const ctx = `${res.method} ${res.path}: ${res.status} ${res.text.slice(0, 200)}`;
  expect(res.status, ctx).toBe(status);
  expect(mediaType(res), ctx).toBe('application/json');
  expect(res.json, ctx).toBeTypeOf('object');
  expect(Object.keys(res.json), ctx).toEqual(['error']);
  expect(Object.keys(res.json.error).sort(), ctx).toEqual(['code', 'message']);
  expect(ERROR_CODES as readonly string[], ctx).toContain(res.json.error.code);
  expect(res.json.error.code, ctx).toBe(code);
  const msg: unknown = res.json.error.message;
  expect(msg, ctx).toBeTypeOf('string');
  expect((msg as string).trim().length, ctx).toBeGreaterThan(0);
  for (const re of FORBIDDEN_MESSAGE_PATTERNS) expect(msg as string, `[R-ERR-4] ${ctx}`).not.toMatch(re);
  for (const v of supplied) {
    if (v.trim().length >= 3) expect(msg as string, `[R-ERR-4] message echoes request value ${JSON.stringify(v)}`).not.toContain(v);
  }
}

/** HEAD variant: status + JSON content-type only. */
export function expectHeadError(res: Res, status: number): void {
  expect(res.status, `${res.method} ${res.path}`).toBe(status);
  expect(mediaType(res)).toBe('application/json');
  expect(res.bytes.length).toBe(0);
}

/** 404 text/plain with a non-empty body (R-REDIR-3, R-ROUTE-1..3). */
export function expectPlain404(res: Res): void {
  const ctx = `${res.method} ${res.path}: ${res.status} ${res.headers['content-type']}`;
  expect(res.status, ctx).toBe(404);
  expect(mediaType(res), ctx).toBe('text/plain');
  if (res.method !== 'HEAD') expect(res.bytes.length, ctx).toBeGreaterThan(0);
  expect(res.headers['location'], ctx).toBeUndefined();
}

export function expectTimestamp(v: unknown): void {
  expect(v).toBeTypeOf('string');
  expect(v as string).toMatch(TS_RE);
  expect(Number.isNaN(Date.parse(v as string))).toBe(false);
}

/** Every field the Link schema defines, with its type, plus the exact values given. */
export function expectLink(l: any, want: Partial<Link> = {}): asserts l is Link {
  expect(l, 'Link body').toBeTypeOf('object');
  expect(l.code).toBeTypeOf('string');
  expect(l.url).toBeTypeOf('string');
  expect(l.shortUrl).toBe(`${PUBLIC_BASE_URL}/${l.code}`); // R-LINK-4
  expect(l.isCustom).toBeTypeOf('boolean');
  expectTimestamp(l.createdAt);
  expect(Number.isInteger(l.clickCount)).toBe(true);
  expect(l.clickCount).toBeGreaterThanOrEqual(0);
  if (l.lastClickedAt !== null) expectTimestamp(l.lastClickedAt);
  for (const [k, v] of Object.entries(want)) expect(l[k], `Link.${k}`).toEqual(v);
}

/** A freshly created link (R-LINK-5). */
export function expectNewLink(l: any, want: Partial<Link> = {}): asserts l is Link {
  expectLink(l, want);
  expect(l.clickCount).toBe(0);
  expect(l.lastClickedAt).toBeNull();
}

export function expectGenerated(l: Link): void {
  expect(l.code).toMatch(/^[A-Za-z0-9]{7}$/);
  expect(l.isCustom).toBe(false);
}

/** Structural checks on a stats body that hold for every request (R-STATS-1/2/4/5/6). */
export function expectStatsShape(s: any, days: number, code: string): asserts s is Stats {
  expect(s.code).toBe(code);
  expect(s.days).toBe(days);
  expect(Number.isInteger(s.totalClicks) && s.totalClicks >= 0).toBe(true);
  expect(Number.isInteger(s.rangeClicks) && s.rangeClicks >= 0).toBe(true);
  expect(Array.isArray(s.daily)).toBe(true);
  expect(s.daily).toHaveLength(days);
  for (let i = 0; i < s.daily.length; i++) {
    const d = s.daily[i];
    expect(Object.keys(d).sort()).toEqual(['clicks', 'date']);
    expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isInteger(d.clicks) && d.clicks >= 0).toBe(true);
    if (i > 0) {
      const prev = new Date(s.daily[i - 1].date + 'T00:00:00Z');
      prev.setUTCDate(prev.getUTCDate() + 1);
      expect(d.date, 'daily is consecutive, oldest first').toBe(prev.toISOString().slice(0, 10));
    }
  }
  expect(s.rangeClicks).toBe(s.daily.reduce((a: number, d: any) => a + d.clicks, 0));
  expect(s.totalClicks).toBeGreaterThanOrEqual(s.rangeClicks);
  for (const key of ['topReferrers', 'topCountries', 'devices']) {
    const arr = s[key];
    expect(Array.isArray(arr), key).toBe(true);
    if (key !== 'devices') expect(arr.length, key).toBeLessThanOrEqual(5);
    for (const e of arr) {
      expect(Object.keys(e).sort()).toEqual(['clicks', 'name']);
      expect(e.name).toBeTypeOf('string');
      expect(Number.isInteger(e.clicks) && e.clicks >= 1).toBe(true);
    }
    expectBreakdownSorted(arr, key);
  }
}

/** clicks descending, then name ascending in code-point order (R-STATS-5, R-STATS-6). */
export function expectBreakdownSorted(arr: { name: string; clicks: number }[], label = 'breakdown'): void {
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1];
    const b = arr[i];
    const ok = a.clicks > b.clicks || (a.clicks === b.clicks && codePointLess(a.name, b.name));
    expect(ok, `${label} not sorted at ${i}: ${JSON.stringify(arr)}`).toBe(true);
  }
}

export function codePointLess(a: string, b: string): boolean {
  const A = [...a].map((c) => c.codePointAt(0)!);
  const B = [...b].map((c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] < B[i];
  return A.length < B.length;
}
