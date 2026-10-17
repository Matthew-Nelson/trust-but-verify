import { describe, expect, test } from 'vitest';
import { COUNTRY_HEADER } from '../../lib/config.ts';
import { api } from '../../lib/http.ts';
import {
  addDays, alias, createOk, enc, followRaw, getLinkOk, getStatsOk, retryIfDayChanged, uurl, waitForRangeClicks,
} from '../../lib/links.ts';
import { expectStatsShape } from '../../lib/assert.ts';

describe('GET /api/links/{code}/stats', () => {
  test('[R-STATS-1][R-STATS-2] default days is 30: days 30 and exactly 30 daily entries, code echoed', async () => {
    const l = await createOk({ url: uurl('s1'), alias: alias('s1') });
    const r = await api('GET', `/api/links/${enc(l.code)}/stats`);
    expect(r.status).toBe(200);
    expectStatsShape(r.json, 30, l.code);
  });

  test.each([1, 2, 7, 90, 364, 365])('[R-STATS-1][R-STATS-2] days=%i -> days echoed and exactly that many entries', async (days) => {
    const l = await createOk({ url: uurl('s1'), alias: alias('s1d') });
    const s = await getStatsOk(l.code, `?days=${days}`);
    expectStatsShape(s, days, l.code);
    expect(s.daily.every((d) => d.clicks === 0) && s.totalClicks === 0, 'a new link has no clicks').toBe(true);
  });

  test('[R-STATS-1] days is a query integer after percent-decoding: days=%37 means 7', async () => {
    const l = await createOk({ url: uurl('s1'), alias: alias('s1p') });
    const s = await getStatsOk(l.code, '?days=%37');
    expectStatsShape(s, 7, l.code);
    expect(s.daily.every((d) => d.clicks === 0) && s.totalClicks === 0, 'a new link has no clicks').toBe(true);
  });

  test('[R-STATS-2] a link created today gets the full window, zero-filled, ending today', async () => {
    const l = await createOk({ url: uurl('s2') });
    const s = await getStatsOk(l.code, '?days=30');
    expectStatsShape(s, 30, l.code);
    for (const d of s.daily) expect(d.clicks).toBe(0);
    const today = s.daily[29].date;
    const created = l.createdAt.slice(0, 10);
    // createdAt's UTC date is today unless the run crossed midnight in between.
    expect([created, addDays(created, 1)]).toContain(today);
    expect(s.daily[0].date).toBe(addDays(today, -29));
    expect(s.totalClicks).toBe(0);
    expect(s.rangeClicks).toBe(0);
    expect(s.topReferrers).toEqual([]);
    expect(s.topCountries).toEqual([]);
    expect(s.devices).toEqual([]);
  });

  test('[R-STATS-2][R-STATS-3] a click now lands on the last entry (today), for days=1, 7 and 365', async () => {
    const l = await createOk({ url: uurl('s3'), alias: alias('s3') });
    const r = await followRaw(l.code, []);
    expect(r.status).toBe(302);
    await waitForRangeClicks(l.code, 1, r.headersAt);
    await retryIfDayChanged(
      async () => (await getStatsOk(l.code, '?days=1')).daily[0].date,
      async (today) => {
        for (const days of [1, 7, 365]) {
          const s = await getStatsOk(l.code, `?days=${days}`);
          expectStatsShape(s, days, l.code);
          expect(s.daily[days - 1]).toEqual({ date: today, clicks: 1 });
          expect(s.rangeClicks).toBe(1);
          expect(s.totalClicks).toBe(1);
        }
      },
    );
  });

  test('[R-STATS-2] windows of different sizes agree: days=7 equals the last 7 entries of days=30', async () => {
    const l = await createOk({ url: uurl('s2b') });
    const r = await followRaw(l.code, []);
    await waitForRangeClicks(l.code, 1, r.headersAt);
    await retryIfDayChanged(
      async () => (await getStatsOk(l.code, '?days=1')).daily[0].date,
      async () => {
        const s7 = await getStatsOk(l.code, '?days=7');
        const s30 = await getStatsOk(l.code, '?days=30');
        expect(s7.daily).toEqual(s30.daily.slice(23));
      },
    );
  });

  test('[R-STATS-4] rangeClicks is the sum of daily and totalClicks equals clickCount', async () => {
    const l = await createOk({ url: uurl('s4') });
    let t = 0;
    for (let i = 0; i < 4; i++) t = (await followRaw(l.code, [])).headersAt;
    const s = await waitForRangeClicks(l.code, 4, t);
    expect(s.rangeClicks).toBe(s.daily.reduce((a, d) => a + d.clicks, 0));
    const g = await getLinkOk(l.code);
    expect(s.totalClicks).toBe(g.clickCount);
    expect(s.totalClicks).toBe(4);
  });

  test('[R-STATS-5][R-STATS-6] breakdowns: at most 5, clicks desc then name asc in code-point order, direct/unknown ordinary', async () => {
    const l = await createOk({ url: uurl('s5'), alias: alias('s5') });
    const UA = {
      tablet: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
      desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      bot: 'Googlebot/2.1',
      unknown: null,
    } as const;
    // [referrer or null (direct), country or null (unknown), device]
    const plan: [string | null, string | null, keyof typeof UA][] = [
      ['https://zz.io/', 'gb', 'tablet'],
      ['https://zz.io/', 'GB', 'tablet'],
      ['https://www.zz.io/', 'Gb', 'tablet'],
      ['https://x-y.io/', 'us', 'desktop'],
      ['https://x-y.io/', 'US', 'desktop'],
      ['https://xa.io/', null, 'mobile'],
      ['https://xa.io/', null, 'mobile'],
      ['https://b.io/', 'zz', 'bot'],
      ['https://c.io/', 'aa', 'bot'],
      [null, 'de', 'unknown'],
      ['https://a.io/', 'fr', 'unknown'],
    ];
    let t = 0;
    for (const [ref, country, dev] of plan) {
      const h: string[] = [];
      if (ref) h.push('Referer', ref);
      if (country) h.push(COUNTRY_HEADER, country);
      const ua = UA[dev];
      if (ua !== null) h.push('User-Agent', ua);
      const r = await followRaw(l.code, h, ua === null ? ['user-agent'] : []);
      expect(r.status).toBe(302);
      t = r.headersAt;
    }
    const s = await waitForRangeClicks(l.code, plan.length, t);
    expectStatsShape(s, 30, l.code);
    // "x-y.io" < "xa.io" in code-point order ('-' is U+002D, 'a' is U+0061); a locale collation that ignores
    // punctuation would order them the other way.
    expect(s.topReferrers).toEqual([
      { name: 'zz.io', clicks: 3 },
      { name: 'x-y.io', clicks: 2 },
      { name: 'xa.io', clicks: 2 },
      { name: 'a.io', clicks: 1 },
      { name: 'b.io', clicks: 1 },
    ]);
    // "US" < "unknown" in code-point order ('U' is U+0055, 'u' is U+0075).
    expect(s.topCountries).toEqual([
      { name: 'GB', clicks: 3 },
      { name: 'US', clicks: 2 },
      { name: 'unknown', clicks: 2 },
      { name: 'AA', clicks: 1 },
      { name: 'DE', clicks: 1 },
    ]);
    expect(s.devices).toEqual([
      { name: 'tablet', clicks: 3 },
      { name: 'bot', clicks: 2 },
      { name: 'desktop', clicks: 2 },
      { name: 'mobile', clicks: 2 },
      { name: 'unknown', clicks: 2 },
    ]);
  });

  test('[R-STATS-6] devices lists only classes with at least one click', async () => {
    const l = await createOk({ url: uurl('s6') });
    let t = 0;
    for (let i = 0; i < 2; i++) t = (await followRaw(l.code, ['User-Agent', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)'])).headersAt;
    const s = await waitForRangeClicks(l.code, 2, t);
    expect(s.devices).toEqual([{ name: 'mobile', clicks: 2 }]);
    expect(s.topReferrers).toEqual([{ name: 'direct', clicks: 2 }]);
    expect(s.topCountries).toEqual([{ name: 'unknown', clicks: 2 }]);
  });
});
