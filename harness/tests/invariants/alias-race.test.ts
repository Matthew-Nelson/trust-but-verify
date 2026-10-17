import { expect, test } from 'vitest';
import { alias, create, getLinkOk, uurl } from '../../lib/links.ts';
import { expectError } from '../../lib/assert.ts';

const N = 20; // SPEC R-ALIAS-5

test.each([1, 2, 3])('[R-ALIAS-5] %i: 20 concurrent creates of one new alias -> exactly one 201, nineteen 409 alias_taken, nothing else', async () => {
  const a = alias('race');
  const urls = Array.from({ length: N }, (_, i) => uurl(`race${i}`));
  const results = await Promise.all(urls.map((url) => create({ url, alias: a })));
  const statuses = results.map((r) => r.status);
  expect(statuses.filter((s) => s === 201), `statuses: ${statuses.join(',')}`).toHaveLength(1);
  expect(statuses.filter((s) => s === 409)).toHaveLength(N - 1);
  for (const r of results) if (r.status === 409) expectError(r, 409, 'alias_taken', [a]);
  const winner = results.findIndex((r) => r.status === 201);
  expect(results[winner].json.url).toBe(urls[winner]);
  const g = await getLinkOk(a);
  expect(g.url).toBe(urls[winner]);
  expect(g.isCustom).toBe(true);
});
