// Holdout: redirects, click attribution and stats with different inputs.
import { describe, expect, test } from 'vitest';
import { COUNTRY_HEADER } from '../../harness/lib/config.ts';
import { api, cacheDirectives, rawSocket, utf8Header } from '../../harness/lib/http.ts';
import {
  createOk, enc, follow, followRaw, getLinkOk, getStatsOk, oneClick, sleepUntil, uid, waitForClickCount, waitForRangeClicks,
} from '../../harness/lib/links.ts';
import { expectStatsShape } from '../../harness/lib/assert.ts';

const u = (tag: string) => `https://example.org/${tag}/${uid(9)}`;
const H = COUNTRY_HEADER;
const click = (headers: string[], omit: string[] = []) => oneClick((code) => followRaw(code, headers, omit));

describe('holdout: redirect', () => {
  test('[R-REDIR-1][R-REDIR-2] mixed-case alias with an IDN destination: Location exact, no-store', async () => {
    const l = await createOk({ url: `https://bücher.example/${uid()}?q=ü`, alias: `MiX-${uid(6)}` });
    const r = await follow(l.code);
    expect(r.status).toBe(302);
    expect(r.headers['location']).toBe(l.url);
    expect(cacheDirectives(r)).toContain('no-store');
  });

  test('[R-REDIR-4] two spaced redirects -> exactly two clicks, stable at 4 s', async () => {
    const l = await createOk({ url: u('r4') });
    const a = await follow(l.code);
    await waitForClickCount(l.code, 1, a.headersAt);
    const b = await follow(l.code);
    await waitForClickCount(l.code, 2, b.headersAt);
    await sleepUntil(b.headersAt, 4000);
    expect((await getLinkOk(l.code)).clickCount).toBe(2);
  });

  test('[R-REDIR-7] HEAD with a query string on a generated code: 302, same headers, no body, no click', async () => {
    const l = await createOk({ url: u('r7') });
    const h = await api('HEAD', `/${enc(l.code)}?ref=x`);
    const s = await rawSocket('HEAD', `/${enc(l.code)}`);
    expect(s.afterHeaders.length).toBe(0);
    await sleepUntil(h.headersAt, 2500);
    expect((await getLinkOk(l.code)).clickCount).toBe(0);
    const g = await follow(l.code);
    expect([h.status, h.headers['location'], h.headers['cache-control']]).toEqual([302, g.headers['location'], g.headers['cache-control']]);
  });

  test('[R-REDIR-8] odd query with a fragment-bearing stored URL -> Location exactly stored, one click', async () => {
    const l = await createOk({ url: `${u('r8')}#section-2` });
    const r = await follow(l.code, {}, '?a=%zz&b&c=d#ignored');
    expect(r.headers['location']).toBe(l.url);
    await waitForClickCount(l.code, 1, r.headersAt);
    await sleepUntil(r.headersAt, 4000);
    expect((await getLinkOk(l.code)).clickCount).toBe(1);
  });
});

describe('holdout: clicks', () => {
  const refs: [string, string[], string][] = [
    ['upper-case www and path', ['Referer', 'http://WWW.GitHub.com/x/y'], 'github.com'],
    ['three www labels', ['Referer', 'https://www.www.www.b.io/'], 'www.www.b.io'],
    ['upper-case bare WWW', ['Referer', 'http://WWW/'], 'www'],
    ['mailto', ['Referer', 'mailto:a@b.c'], 'direct'],
    ['IDN with sharp s (UTF-8)', ['Referer', utf8Header('https://straße.example/')], new URL('https://straße.example/').hostname],
    ['host "Direct" (case-folded)', ['Referer', 'https://Direct/'], 'direct'],
    ['decimal IPv4', ['Referer', 'http://3232235521/'], '192.168.0.1'],
    ['truncated UTF-8', ['Referer', 'https://a\xc3.example/'], 'direct'],
    ['three Referer headers', ['Referer', 'https://a.example/', 'Referer', 'https://a.example/', 'Referer', 'https://a.example/'], 'direct'],
  ];
  test.concurrent.each(refs)('[R-CLICK-1] Referer %s -> %j', async (_l, h, want) => {
    expect((await click(h)).topReferrers).toEqual([{ name: want, clicks: 1 }]);
  });

  const countries: [string, string[], string][] = [
    ['fr', [H, 'fr'], 'FR'],
    ['leading tab jp', [H, '\tjp'], 'JP'],
    ['Zz', [H, 'Zz'], 'ZZ'],
    ['ZZZ', [H, 'ZZZ'], 'unknown'],
    ['two different values', [H, 'us', H, 'gb'], 'unknown'],
    ['header name in mixed case', [H.split('').map((c, i) => (i % 2 ? c.toUpperCase() : c)).join(''), 'nz'], 'NZ'],
  ];
  test.concurrent.each(countries)('[R-CLICK-2] country %s -> %j', async (_l, h, want) => {
    expect((await click(h)).topCountries).toEqual([{ name: want, clicks: 1 }]);
  });

  const uas: [string, string, string][] = [
    ['YandexBot', 'Mozilla/5.0 (compatible; YandexBot/3.0)', 'bot'],
    ['Baiduspider', 'Baiduspider+(+http://www.baidu.com/search/spider.htm)', 'bot'],
    ['previewer', 'SomePreviewer/2', 'bot'],
    ['crawler with iPhone', 'CRAWLER-iPhone', 'bot'],
    ['Kindle Tablet', 'Mozilla/5.0 (Linux; Kindle Tablet)', 'tablet'],
    ['Android Mobile', 'Mozilla/5.0 (Linux; Android 12; SM-G991B) Mobile', 'mobile'],
    ['Linux Firefox', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0', 'desktop'],
    ['tabs only', '\t \t', 'unknown'],
  ];
  test.concurrent.each(uas)('[R-CLICK-3] User-Agent %s -> %j', async (_l, ua, want) => {
    expect((await click(['User-Agent', ua])).devices).toEqual([{ name: want, clicks: 1 }]);
  });
});

describe('holdout: stats', () => {
  test.each([3, 45, 300])('[R-STATS-1][R-STATS-2] days=%i -> that many zero-filled entries ending today', async (days) => {
    const l = await createOk({ url: u('s1'), alias: `st-${uid(8)}` });
    const s = await getStatsOk(l.code, `?days=${days}`);
    expectStatsShape(s, days, l.code);
    expect(s.daily.every((d) => d.clicks === 0)).toBe(true);
  });

  test('[R-STATS-4][R-STATS-5][R-STATS-6] seven referrers, ties by code point, devices complete', async () => {
    const l = await createOk({ url: u('s5'), alias: `bd-${uid(8)}` });
    const plan: [string | null, string | null, string][] = [
      ['https://q-r.io/', 'ua', 'Mozilla/5.0 (Linux; Android 14; Pixel)'],
      ['https://q-r.io/', 'UA', 'Mozilla/5.0 (Linux; Android 14; Pixel)'],
      ['https://qa.io/', null, 'Mozilla/5.0 (iPad)'],
      ['https://qa.io/', null, 'Mozilla/5.0 (iPad)'],
      ['https://m.io/', 'se', 'curl/8'],
      ['https://n.io/', 'no', 'curl/8'],
      ['https://o.io/', 'dk', 'curl/8'],
      [null, 'fi', 'curl/8'],
    ];
    let t = 0;
    for (const [ref, c, ua] of plan) {
      const h = ['User-Agent', ua];
      if (ref) h.push('Referer', ref);
      if (c) h.push(H, c);
      t = (await followRaw(l.code, h)).headersAt;
    }
    const s = await waitForRangeClicks(l.code, plan.length, t);
    expect(s.topReferrers).toEqual([
      { name: 'q-r.io', clicks: 2 },
      { name: 'qa.io', clicks: 2 },
      { name: 'direct', clicks: 1 },
      { name: 'm.io', clicks: 1 },
      { name: 'n.io', clicks: 1 },
    ]);
    expect(s.topCountries).toEqual([
      { name: 'UA', clicks: 2 },
      { name: 'unknown', clicks: 2 },
      { name: 'DK', clicks: 1 },
      { name: 'FI', clicks: 1 },
      { name: 'NO', clicks: 1 },
    ]);
    expect(s.devices).toEqual([
      { name: 'desktop', clicks: 4 },
      { name: 'mobile', clicks: 2 },
      { name: 'tablet', clicks: 2 },
    ]);
    expect(s.totalClicks).toBe((await getLinkOk(l.code)).clickCount);
  });
});
