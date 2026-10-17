import { describe, expect, test } from 'vitest';
import { api, rawSocket, cacheDirectives } from '../../lib/http.ts';
import { alias, createOk, enc, follow, getLinkOk, getStatsOk, sleepUntil, uid, uurl, waitForClickCount } from '../../lib/links.ts';
import { expectPlain404 } from '../../lib/assert.ts';

describe('GET /{code}', () => {
  test('[R-REDIR-1] a known code -> 302 with Location equal to the stored url (generated and custom codes)', async () => {
    for (const body of [{ url: uurl('r1') }, { url: `https://example.com/r1/${uid()}?q=1&r=a%20b#frag`, alias: alias('r1') }]) {
      const l = await createOk(body);
      const r = await follow(l.code);
      expect(r.status).toBe(302);
      expect(r.headers['location']).toBe(l.url);
    }
  });

  test('[R-REDIR-2][R-REDIR-1] the redirect for a new link has Cache-Control with the no-store directive', async () => {
    const l = await createOk({ url: uurl('r2'), alias: alias('r2') });
    const r = await follow(l.code);
    expect(r.status).toBe(302);
    expect(r.headers['location']).toBe(l.url);
    expect(cacheDirectives(r)).toContain('no-store');
  });

  test('[R-REDIR-4] one redirect records exactly one click, visible within 2.5 s and unchanged at 4 s', async () => {
    const l = await createOk({ url: uurl('r4'), alias: alias('r4') });
    const r = await follow(l.code);
    expect(r.status).toBe(302);
    const g = await waitForClickCount(l.code, 1, r.headersAt);
    expect(g.lastClickedAt).not.toBeNull();
    const s = await getStatsOk(l.code);
    expect(s.totalClicks).toBe(1);
    expect(s.rangeClicks).toBe(1);
    expect(s.daily.reduce((a, d) => a + d.clicks, 0)).toBe(1);
    expect(s.devices).toEqual([{ name: 'desktop', clicks: 1 }]);
    await sleepUntil(r.headersAt, 4000);
    const g2 = await getLinkOk(l.code);
    expect(g2.clickCount).toBe(1);
    expect(g2.lastClickedAt).toBe(g.lastClickedAt);
    const s2 = await getStatsOk(l.code);
    expect(s2.totalClicks).toBe(1);
    expect(s2.rangeClicks).toBe(1);
  });

  test('[R-REDIR-4] five sequential redirects record exactly five clicks', async () => {
    const l = await createOk({ url: uurl('r4b') });
    let t = 0;
    for (let i = 0; i < 5; i++) t = (await follow(l.code)).headersAt;
    await waitForClickCount(l.code, 5, t);
    await sleepUntil(t, 4000);
    expect((await getLinkOk(l.code)).clickCount).toBe(5);
  });

  test('[R-REDIR-7] HEAD /{code} -> same status, Location and Cache-Control as GET, no body, and no click', async () => {
    const l = await createOk({ url: uurl('r7'), alias: alias('r7') });
    const heads = [];
    for (let i = 0; i < 3; i++) heads.push(await api('HEAD', `/${enc(l.code)}`));
    const sock = await rawSocket('HEAD', `/${enc(l.code)}`);
    expect(sock.status).toBe(302);
    expect(sock.afterHeaders.length).toBe(0);
    await sleepUntil(heads[2].headersAt, 2500);
    expect((await getLinkOk(l.code)).clickCount).toBe(0);
    const get = await follow(l.code);
    for (const h of heads) {
      expect(h.status).toBe(302);
      expect(h.headers['location']).toBe(get.headers['location']);
      expect(h.headers['cache-control']).toBe(get.headers['cache-control']);
    }
    expect(sock.headers['location']).toBe(l.url);
    await waitForClickCount(l.code, 1, get.headersAt);
  });

  test('[R-REDIR-7] HEAD on an unknown code -> 404 with the same Content-Type as GET, no body', async () => {
    const code = `nope-${uid()}`;
    const get = await follow(code);
    expectPlain404(get);
    const head = await api('HEAD', `/${code}`);
    expect(head.status).toBe(404);
    expect(head.headers['content-type']).toBe(get.headers['content-type']);
    const sock = await rawSocket('HEAD', `/${code}`);
    expect(sock.status).toBe(404);
    expect(sock.afterHeaders.length).toBe(0);
  });

  test('[R-REDIR-8] the request query string is ignored: Location is the stored url, and one click is recorded', async () => {
    const stored = `https://example.com/r8/${uid()}?a=1`;
    const l = await createOk({ url: stored, alias: alias('r8') });
    const r = await follow(l.code, {}, '?utm_source=news&a=2&code=other');
    expect(r.status).toBe(302);
    expect(r.headers['location']).toBe(stored);
    await waitForClickCount(l.code, 1, r.headersAt);
    await sleepUntil(r.headersAt, 4000);
    expect((await getLinkOk(l.code)).clickCount).toBe(1);
  });

  test('[R-REDIR-8] an empty or odd query string still redirects to exactly the stored url', async () => {
    const l = await createOk({ url: uurl('r8b') });
    for (const q of ['?', '?%zz', '?x', '?days=0&limit=-1']) {
      const r = await follow(l.code, {}, q);
      expect(r.status, q).toBe(302);
      expect(r.headers['location'], q).toBe(l.url);
    }
  });
});
