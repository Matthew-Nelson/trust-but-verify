// Runs in the sequential invariants suite: paging the whole table is only meaningful while nothing
// else is creating or deleting links.
import { expect, test } from 'vitest';
import { api } from '../../lib/http.ts';
import { createOk, uurl, type Link } from '../../lib/links.ts';

type Page = { items: Link[]; total: number; limit: number; offset: number };
const list = async (q: string): Promise<Page> => {
  const r = await api('GET', `/api/links${q}`);
  expect(r.status).toBe(200);
  return r.json as Page;
};

test('[R-LIST-2][R-LIST-1] total equals the number of distinct links reachable by paging; pages do not overlap', async () => {
  const before = (await list('?limit=1')).total;
  const mine = await createOk({ url: uurl('total') });
  const first = await list('?limit=100&offset=0');
  // Nothing else runs during the invariants suite, so total moves by exactly one.
  expect(first.total).toBe(before + 1);
  const seen = new Set(first.items.map((l) => l.code));
  let count = first.items.length;
  for (let off = 100; off < first.total; off += 100) {
    const p = await list(`?limit=100&offset=${off}`);
    expect(p.total).toBe(first.total);
    expect(p.items.length).toBe(Math.min(100, first.total - off));
    p.items.forEach((l) => seen.add(l.code));
    count += p.items.length;
  }
  expect(count).toBe(first.total);
  expect(seen.size).toBe(first.total);
  expect(seen.has(mine.code)).toBe(true);
});
