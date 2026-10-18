// Runs in the sequential invariants suite: exact `total` values and absolute list positions are only
// meaningful while nothing else is creating or deleting links (SPEC "Shared database"; review HR-07).
import { expect, test } from 'vitest';
import { api } from '../../lib/http.ts';
import { createOk, lazy, pool, uurl, type Link } from '../../lib/links.ts';

// At least 21 links exist while these tests run.
const ensure21 = lazy(() => pool(Array.from({ length: 21 }), 7, () => createOk({ url: uurl('inv-list') })));

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

test('[R-LIST-1] offset skips exactly that many items in list order', async () => {
  await ensure21();
  const full = await list('?limit=12&offset=0');
  const slice = await list('?limit=4&offset=3');
  expect(slice.offset).toBe(3);
  expect(slice.limit).toBe(4);
  expect(slice.total).toBe(full.total);
  expect(slice.items.map((l) => l.code)).toEqual(full.items.slice(3, 7).map((l) => l.code));
});

test('[R-LIST-2] offset >= total -> 200 with items [] (offset = total and offset = total + 1000)', async () => {
  await ensure21();
  const { total } = await list('?limit=1');
  const atTotal = await list(`?offset=${total}`);
  expect(atTotal.items).toEqual([]);
  expect(atTotal.offset).toBe(total);
  expect(atTotal.total).toBe(total);
  const plus = await list(`?offset=${total + 1000}`);
  expect(plus.items).toEqual([]);
  expect(plus.offset).toBe(total + 1000);
  const last = await list(`?offset=${total - 1}&limit=5`);
  expect(last.items).toHaveLength(1);
  const p = await list('?offset=100000000');
  expect(p.items).toEqual([]);
  expect(p.offset).toBe(100000000);
  expect(p.total).toBeGreaterThanOrEqual(21);
});
