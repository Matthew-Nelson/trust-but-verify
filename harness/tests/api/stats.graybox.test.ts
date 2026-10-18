// Gray-box stats tests: clicks are seeded directly into the database (SPEC "Data model") at absolute
// timestamps anchored to the database's today D. They skip when DATABASE_URL is unset.
import { describe, expect, test } from 'vitest';
import { GRAY_SKIP, hasDb } from '../../lib/config.ts';
import { addDays, alias, createOk, getLinkOk, getStatsOk, micros, uurl } from '../../lib/links.ts';
import { expectStatsShape } from '../../lib/assert.ts';
import { anchoredToToday, dbNow, seedClicks } from '../../lib/db.ts';

const T0 = 'T00:00:00Z';
const TEND = 'T23:59:59.999999Z';

describe('stats with seeded clicks (gray-box)', () => {
  test('[R-STATS-2][R-STATS-3][gray-box] window is [first day 00:00Z, day after today 00:00Z); daily is exact and oldest first', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    await anchoredToToday(async (D) => {
      const l = await createOk({ url: uurl('gw'), alias: alias('gw') });
      await seedClicks(l.code, [
        { at: D + T0, count: 2 }, // today, first instant
        { at: D + TEND }, // today, last instant
        { at: addDays(D, -1) + TEND },
        { at: addDays(D, -6) + T0 }, // first day of a 7-day window
        { at: addDays(D, -7) + TEND }, // just before a 7-day window
        { at: addDays(D, 1) + T0 }, // day after today: never in a window
        { at: addDays(D, -400) + 'T12:00:00Z' }, // older than any window
      ]);
      const s7 = await getStatsOk(l.code, '?days=7');
      expectStatsShape(s7, 7, l.code);
      expect(s7.daily.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(D, i - 6)));
      expect(s7.daily.map((d) => d.clicks)).toEqual([1, 0, 0, 0, 0, 1, 3]);
      expect(s7.rangeClicks).toBe(5);
      expect(s7.totalClicks).toBe(8);

      const s1 = await getStatsOk(l.code, '?days=1');
      expect(s1.daily).toEqual([{ date: D, clicks: 3 }]);
      expect(s1.rangeClicks).toBe(3);
      expect(s1.totalClicks).toBe(8);

      const s8 = await getStatsOk(l.code, '?days=8');
      expect(s8.daily[0]).toEqual({ date: addDays(D, -7), clicks: 1 });
      expect(s8.rangeClicks).toBe(6);

      const s365 = await getStatsOk(l.code, '?days=365');
      expectStatsShape(s365, 365, l.code);
      expect(s365.daily[0].date).toBe(addDays(D, -364));
      expect(s365.daily[364]).toEqual({ date: D, clicks: 3 });
      expect(s365.rangeClicks).toBe(6);
      expect(s365.totalClicks).toBe(8);
    });
  });

  test('[R-STATS-2][gray-box] the last daily entry is the database\'s today, and the default window has 30 entries', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    const l = await createOk({ url: uurl('gt') });
    await anchoredToToday(async (D) => {
      const s = await getStatsOk(l.code);
      expect(s.daily).toHaveLength(30);
      expect(s.daily[29].date).toBe(D);
      expect(s.daily[0].date).toBe(addDays(D, -29));
    });
  });

  test('[R-STATS-3][R-STATS-5][R-STATS-6][gray-box] breakdowns count only clicks in the window', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    await anchoredToToday(async (D) => {
      const l = await createOk({ url: uurl('gb') });
      await seedClicks(l.code, [
        { at: addDays(D, -7) + TEND, referrer: 'old.example', country: 'JP', device: 'bot', count: 10 },
        { at: addDays(D, 1) + T0, referrer: 'future.example', country: 'KR', device: 'mobile', count: 10 },
        { at: addDays(D, -6) + T0, referrer: 'new.example', country: 'NZ', device: 'tablet' },
      ]);
      const s = await getStatsOk(l.code, '?days=7');
      expect(s.topReferrers).toEqual([{ name: 'new.example', clicks: 1 }]);
      expect(s.topCountries).toEqual([{ name: 'NZ', clicks: 1 }]);
      expect(s.devices).toEqual([{ name: 'tablet', clicks: 1 }]);
      expect(s.rangeClicks).toBe(1);
      expect(s.totalClicks).toBe(21);
      const s8 = await getStatsOk(l.code, '?days=8');
      expect(s8.topReferrers).toEqual([{ name: 'old.example', clicks: 10 }, { name: 'new.example', clicks: 1 }]);
      expect(s8.devices).toEqual([{ name: 'bot', clicks: 10 }, { name: 'tablet', clicks: 1 }]);
    });
  });

  test('[R-STATS-5][gray-box] top-5 cut-off with ties resolved by code-point name order', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    await anchoredToToday(async (D) => {
      const l = await createOk({ url: uurl('g5') });
      const at = D + 'T06:00:00Z';
      await seedClicks(l.code, [
        { at, referrer: 'b.example', country: 'BB', count: 4 },
        { at, referrer: null, country: null, count: 4 }, // direct / unknown
        { at, referrer: 'a-b.example', country: 'AA', count: 2 },
        { at, referrer: 'ab.example', country: 'AB', count: 2 },
        { at, referrer: '1.example', country: 'ZZ', count: 2 },
        { at, referrer: 'zz.example', country: 'YY', count: 2 },
      ]);
      const s = await getStatsOk(l.code, '?days=1');
      expect(s.topReferrers).toEqual([
        { name: 'b.example', clicks: 4 },
        { name: 'direct', clicks: 4 },
        { name: '1.example', clicks: 2 },
        { name: 'a-b.example', clicks: 2 },
        { name: 'ab.example', clicks: 2 },
      ]);
      expect(s.topCountries).toEqual([
        { name: 'BB', clicks: 4 },
        { name: 'unknown', clicks: 4 },
        { name: 'AA', clicks: 2 },
        { name: 'AB', clicks: 2 },
        { name: 'YY', clicks: 2 },
      ]);
    });
  });

  test('[R-DATA-1][R-STATS-4][gray-box] a row inserted into clicks appears in every click-derived field on the next request', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    await anchoredToToday(async (D) => {
      const l = await createOk({ url: uurl('gd'), alias: alias('gd') });
      const before = await getStatsOk(l.code, '?days=7');
      expect(before.totalClicks).toBe(0);
      const at = addDays(D, -2) + 'T08:09:10.654321Z';
      await seedClicks(l.code, [{ at, referrer: 'seeded.example', country: 'CA', device: 'tablet' }]);
      const g = await getLinkOk(l.code);
      expect(g.clickCount).toBe(1);
      expect(micros(g.lastClickedAt!)).toBe(micros(at));
      const s = await getStatsOk(l.code, '?days=7');
      expect(s.totalClicks).toBe(1);
      expect(s.rangeClicks).toBe(1);
      expect(s.daily[4]).toEqual({ date: addDays(D, -2), clicks: 1 });
      expect(s.topReferrers).toEqual([{ name: 'seeded.example', clicks: 1 }]);
      expect(s.topCountries).toEqual([{ name: 'CA', clicks: 1 }]);
      expect(s.devices).toEqual([{ name: 'tablet', clicks: 1 }]);
      await seedClicks(l.code, [{ at: D + 'T00:00:01Z', device: 'unknown' }]);
      const s2 = await getStatsOk(l.code, '?days=7');
      expect(s2.totalClicks).toBe(2);
      expect(s2.devices).toEqual([{ name: 'tablet', clicks: 1 }, { name: 'unknown', clicks: 1 }]);
      expect((await getLinkOk(l.code)).clickCount).toBe(2);
    });
  });

  test('[R-GET-1][gray-box] clickCount is the row count and lastClickedAt is max(clicked_at) at full microsecond precision', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    const { today: D } = await dbNow();
    const l = await createOk({ url: uurl('gp') });
    const max = addDays(D, -3) + 'T12:34:56.123457Z';
    await seedClicks(l.code, [
      { at: addDays(D, -3) + 'T12:34:56.123456Z', count: 3 },
      { at: max },
      { at: addDays(D, -200) + 'T00:00:00Z' },
    ]);
    const g = await getLinkOk(l.code);
    expect(g.clickCount).toBe(5);
    expect(micros(g.lastClickedAt!)).toBe(micros(max));
    const s = await getStatsOk(l.code);
    expect(s.totalClicks).toBe(5);
  });

  test('[R-DATA-2][gray-box] the api reports stored values unchanged, mapping NULL to direct/unknown', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    await anchoredToToday(async (D) => {
      const l = await createOk({ url: uurl('gv') });
      const at = D + 'T01:00:00Z';
      await seedClicks(l.code, [
        { at, referrer: 'xn--bcher-kva.example', country: 'ZZ', device: 'bot', count: 3 },
        { at, referrer: null, country: null, device: 'unknown', count: 2 },
        { at, referrer: '[::1]', country: 'QX', device: 'mobile' },
      ]);
      const s = await getStatsOk(l.code, '?days=1');
      expect(s.topReferrers).toEqual([{ name: 'xn--bcher-kva.example', clicks: 3 }, { name: 'direct', clicks: 2 }, { name: '[::1]', clicks: 1 }]);
      expect(s.topCountries).toEqual([{ name: 'ZZ', clicks: 3 }, { name: 'unknown', clicks: 2 }, { name: 'QX', clicks: 1 }]);
      expect(s.devices).toEqual([{ name: 'bot', clicks: 3 }, { name: 'unknown', clicks: 2 }, { name: 'mobile', clicks: 1 }]);
    });
  });
});
