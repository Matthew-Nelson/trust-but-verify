import { describe, expect, test } from 'vitest';
import { api } from '../../lib/http.ts';
import { alias, create, createOk, del, enc, follow, getLink, getLinkOk, getStats, getStatsOk, micros, uid, uurl, waitForClickCount } from '../../lib/links.ts';
import { expectError, expectLink, expectNewLink, expectPlain404, expectSameLink } from '../../lib/assert.ts';

describe('GET /api/links/{code}', () => {
  test('[R-GET-1] returns the same Link the create returned (every field)', async () => {
    for (const body of [{ url: uurl('g1') }, { url: uurl('g1'), alias: alias('g1') }]) {
      const created = await createOk(body);
      const r = await getLink(created.code);
      expect(r.status).toBe(200);
      expectNewLink(r.json);
      expectSameLink(r.json, created);
    }
  });

  test('[R-GET-1][R-REDIR-4] clickCount counts redirects and lastClickedAt is set, after createdAt, and advances', async () => {
    const l = await createOk({ url: uurl('g2'), alias: alias('g2') });
    let last = 0;
    for (let i = 1; i <= 3; i++) {
      const r = await follow(l.code);
      expect(r.status).toBe(302);
      last = r.headersAt;
    }
    const g = await waitForClickCount(l.code, 3, last);
    expectLink(g, { code: l.code, url: l.url, createdAt: l.createdAt, isCustom: true });
    expect(g.lastClickedAt).not.toBeNull();
    expect(micros(g.lastClickedAt!) >= micros(l.createdAt)).toBe(true);

    const r = await follow(l.code);
    const g2 = await waitForClickCount(l.code, 4, r.headersAt);
    expect(micros(g2.lastClickedAt!) > micros(g.lastClickedAt!)).toBe(true);
  });
});

describe('DELETE /api/links/{code}', () => {
  test('[R-DEL-1] delete -> 204 with no body; afterwards GET, DELETE, stats and /{code} all 404', async () => {
    for (const body of [{ url: uurl('d1'), alias: alias('d1') }, { url: uurl('d1') }]) {
      const l = await createOk(body);
      const r = await del(l.code);
      expect(r.status).toBe(204);
      expect(r.bytes.length).toBe(0);
      expectError(await getLink(l.code), 404, 'not_found');
      expectError(await del(l.code), 404, 'not_found');
      expectError(await getStats(l.code), 404, 'not_found');
      expectPlain404(await follow(l.code));
      const head = await api('HEAD', `/api/links/${enc(l.code)}`);
      expect(head.status).toBe(404);
    }
  });

  test('[R-DEL-1][R-ALIAS-4] deleting a link leaves its case-variant sibling alone', async () => {
    const id = uid(8);
    const a = await createOk({ url: uurl('d2'), alias: `Del-${id}` });
    const b = await createOk({ url: uurl('d2'), alias: `del-${id}` });
    expect((await del(a.code)).status).toBe(204);
    expect((await getLinkOk(b.code)).url).toBe(b.url);
    expect((await follow(b.code)).headers['location']).toBe(b.url);
  });

  test('[R-DEL-2] after deletion the alias can be reused, and the new link starts with no clicks', async () => {
    const a = alias('d3');
    const first = await createOk({ url: uurl('d3old'), alias: a });
    const r = await follow(a);
    await waitForClickCount(a, 1, r.headersAt);
    expect((await del(a)).status).toBe(204);
    const newUrl = uurl('d3new');
    const again = await create({ url: newUrl, alias: a });
    expect(again.status, again.text).toBe(201);
    expectNewLink(again.json, { code: a, url: newUrl, isCustom: true });
    expect(again.json.url).not.toBe(first.url);
    const s = await getStatsOk(a);
    expect(s.totalClicks).toBe(0);
    expect(s.rangeClicks).toBe(0);
    expect(s.topReferrers).toEqual([]);
    expect(s.devices).toEqual([]);
    expect((await follow(a)).headers['location']).toBe(newUrl);
  });

  test('[R-DEL-2] a deleted generated code can be reused as a custom alias', async () => {
    const g = await createOk({ url: uurl('d4') });
    expect((await del(g.code)).status).toBe(204);
    const r = await create({ url: uurl('d4'), alias: g.code });
    expect(r.status, r.text).toBe(201);
    expectNewLink(r.json, { code: g.code, isCustom: true });
  });
});
