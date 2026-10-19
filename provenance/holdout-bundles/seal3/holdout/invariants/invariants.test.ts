// Holdout invariants: same rules, other inputs. Run alone (SPEC "Scheduling").
import { expect, test } from 'vitest';
import { COUNTRY_HEADER } from '../../harness/lib/config.ts';
import { create, createOk, followRaw, getLinkOk, pool, sleepUntil, uid, type Link } from '../../harness/lib/links.ts';
import { expectError } from '../../harness/lib/assert.ts';

test('[R-ALIAS-5] 20 concurrent creates of a mixed-case alias with http:// urls -> one 201, nineteen 409', async () => {
  const a = `RaCe_${uid(10)}`;
  const urls = Array.from({ length: 20 }, (_, i) => `http://example.net/race/${i}/${uid(6)}`);
  const rs = await Promise.all(urls.map((url) => create({ url, alias: a })));
  expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
  expect(rs.filter((r) => r.status === 409)).toHaveLength(19);
  rs.filter((r) => r.status === 409).forEach((r) => expectError(r, 409, 'alias_taken'));
  const w = rs.findIndex((r) => r.status === 201);
  expect((await getLinkOk(a)).url).toBe(urls[w]);
});

test('[R-REDIR-5] 500 redirects of a generated code with mobile UA and referrers, >= 100 in flight -> all 302, +500 exactly', async () => {
  const l = await createOk({ url: `https://example.net/burst/${uid()}` });
  let inFlight = 0;
  let max = 0;
  let last = 0;
  const statuses = await pool(Array.from({ length: 500 }, (_, i) => i), 110, async (i) => {
    inFlight++;
    max = Math.max(max, inFlight);
    const r = await followRaw(l.code, ['User-Agent', 'Mozilla/5.0 (iPhone)', 'Referer', `https://r${i % 7}.example/`, COUNTRY_HEADER, 'ca']);
    inFlight--;
    last = Math.max(last, r.headersAt);
    return r.status;
  });
  expect(max).toBeGreaterThanOrEqual(100);
  expect(statuses.every((s) => s === 302)).toBe(true);
  await sleepUntil(last, 2000);
  expect((await getLinkOk(l.code)).clickCount).toBe(500);
  await sleepUntil(last, 4000);
  expect((await getLinkOk(l.code)).clickCount).toBe(500);
});

test('[R-LINK-6][R-LINK-7] 1,000 sequential creates alternating alias null / "" / omitted -> 1,000 distinct codes', async () => {
  const codes = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const body: Record<string, unknown> = { url: `http://example.net/bulk/${i}` };
    if (i % 3 === 0) body.alias = null;
    if (i % 3 === 1) body.alias = '';
    const r = await create(body);
    expect(r.status).toBe(201);
    expect((r.json as Link).code).toMatch(/^[A-Za-z0-9]{7}$/);
    codes.add((r.json as Link).code);
  }
  expect(codes.size).toBe(1000);
});
