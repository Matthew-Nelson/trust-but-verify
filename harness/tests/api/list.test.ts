import { describe, expect, test } from 'vitest';
import { GRAY_SKIP, hasDb } from '../../lib/config.ts';
import { api } from '../../lib/http.ts';
import { alias, createOk, del, findInList, follow, getLinkOk, micros, lazy, pool, uurl, waitForClickCount, type Link } from '../../lib/links.ts';
import { expectLink } from '../../lib/assert.ts';
import { db, dbNow } from '../../lib/db.ts';

type Page = { items: Link[]; total: number; limit: number; offset: number };
const list = async (q = ''): Promise<Page> => {
  const r = await api('GET', `/api/links${q}`);
  expect(r.status, r.text).toBe(200);
  return r.json as Page;
};

/** Retry a check that can be disturbed by other tests' concurrent creates/deletes. */
async function settle(attempts: number, fn: () => Promise<void>): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
    }
  }
}

// At least 21 links always exist while this file runs (these are never deleted).
const getMine = lazy(() => pool(Array.from({ length: 21 }), 7, () => createOk({ url: uurl('list') })));

describe('GET /api/links', () => {
  test('[R-LIST-1] my three new links appear newest-first (sequential creates)', async () => {
    const a = await createOk({ url: uurl('ord'), alias: alias('ord1') });
    const b = await createOk({ url: uurl('ord') });
    const c = await createOk({ url: uurl('ord'), alias: alias('ord3') });
    const { order } = await findInList([a.code, b.code, c.code]);
    expect(order).toEqual([c.code, b.code, a.code]);
  });

  test('[R-LIST-2] total grows by at least the number of links created', async () => {
    await settle(3, async () => {
      const before = (await list('?limit=1')).total;
      for (let i = 0; i < 3; i++) await createOk({ url: uurl('tot') });
      const after = (await list('?limit=1')).total;
      expect(after).toBeGreaterThanOrEqual(before + 3);
    });
  });

  test('[R-LIST-1][R-LIST-2] defaults: limit 20, offset 0, exactly 20 items when total > 20', async () => {
    await getMine();
    const p = await list();
    expect(p.limit).toBe(20);
    expect(p.offset).toBe(0);
    expect(p.total).toBeGreaterThanOrEqual(21);
    expect(p.items).toHaveLength(20);
    for (const it of p.items) expectLink(it);
  });

  test('[R-LIST-1] limit bounds the page size exactly (1, 5, 100)', async () => {
    await getMine();
    expect((await list('?limit=1')).items).toHaveLength(1);
    expect((await list('?limit=5')).items).toHaveLength(5);
    const p = await list('?limit=100');
    expect(p.limit).toBe(100);
    expect(p.items.length).toBeLessThanOrEqual(100);
    expect(p.items.length).toBeGreaterThanOrEqual(Math.min(100, 21));
  });

  test('[R-LIST-1] offset skips exactly that many items in list order', async () => {
    await getMine();
    await settle(5, async () => {
      const full = await list('?limit=12&offset=0');
      const slice = await list('?limit=4&offset=3');
      expect(slice.offset).toBe(3);
      expect(slice.limit).toBe(4);
      expect(slice.items.map((l) => l.code)).toEqual(full.items.slice(3, 7).map((l) => l.code));
    });
  });

  test('[R-LIST-2] offset >= total -> 200 with items [] (offset = total and offset = total + 1000)', async () => {
    await getMine();
    await settle(5, async () => {
      const { total } = await list('?limit=1');
      const atTotal = await list(`?offset=${total}`);
      expect(atTotal.items).toEqual([]);
      expect(atTotal.offset).toBe(total);
      expect(atTotal.total).toBe(total);
      const last = await list(`?offset=${total - 1}&limit=5`);
      expect(last.items).toHaveLength(1);
    });
    const p = await list('?offset=100000000');
    expect(p.items).toEqual([]);
    expect(p.offset).toBe(100000000);
    expect(p.total).toBeGreaterThanOrEqual(21);
  });

  test('[R-LIST-1][R-GET-1] list items carry the same field values as GET, including click data', async () => {
    const l = await createOk({ url: uurl('lc'), alias: alias('lc') });
    const r = await follow(l.code);
    expect(r.status).toBe(302);
    const g = await waitForClickCount(l.code, 1, r.headersAt);
    const { items } = await findInList([l.code]);
    const it = items.get(l.code)!;
    expectLink(it, { code: l.code, url: l.url, isCustom: true, clickCount: 1, shortUrl: l.shortUrl });
    expect(it.createdAt).toBe(g.createdAt);
    expect(it.lastClickedAt).toBe(g.lastClickedAt);
  });

  test('[R-LIST-1][gray-box] ties on createdAt break by internal id descending; createdAt dominates id', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    const { now } = await dbNow();
    const codes = { d: alias('gD'), a: alias('gA'), b: alias('gB'), c: alias('gC') };
    const ins = (code: string, offset: string) =>
      db().query(
        `INSERT INTO links (code, url, is_custom, created_at) VALUES ($1, $2, true, $3::timestamptz + $4::interval)`,
        [code, uurl('seed'), now, offset],
      );
    // Insertion order fixes id order: d < a < b < c.
    await ins(codes.d, '1 millisecond');
    await ins(codes.a, '0');
    await ins(codes.b, '0');
    await ins(codes.c, '-1 second');
    try {
      const { order, items } = await findInList(Object.values(codes));
      expect(order).toEqual([codes.d, codes.b, codes.a, codes.c]);
      expect(items.get(codes.a)!.createdAt).toBe(items.get(codes.b)!.createdAt);
    } finally {
      await Promise.all(Object.values(codes).map((c) => del(c)));
    }
  });

  test('[R-LIST-1] every link in a page is a complete Link and the page is sorted by createdAt descending', async () => {
    await getMine();
    await settle(3, async () => {
      const p = await list('?limit=50');
      expect(p.items.length).toBeGreaterThanOrEqual(21);
      for (let i = 1; i < p.items.length; i++) {
        expect(micros(p.items[i - 1].createdAt) >= micros(p.items[i].createdAt)).toBe(true);
      }
    });
    const l = await getLinkOk((await getMine())[0].code);
    expectLink(l);
  });
});
