// Holdout gray-box: other window sizes and boundary instants. Skips when DATABASE_URL is unset.
import { describe, expect, test } from 'vitest';
import { GRAY_SKIP, hasDb } from '../../harness/lib/config.ts';
import { addDays, createOk, getLinkOk, getStatsOk, micros, uid } from '../../harness/lib/links.ts';
import { anchoredToToday, seedClicks } from '../../harness/lib/db.ts';

describe('holdout: seeded stats (gray-box)', () => {
  test('[R-STATS-2][R-STATS-3][R-STATS-4][gray-box] days=14 and days=2 windows with boundary instants', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    await anchoredToToday(async (D) => {
      const l = await createOk({ url: `https://example.org/g14/${uid()}` });
      await seedClicks(l.code, [
        { at: addDays(D, -13) + 'T00:00:00Z' }, // first day of 14
        { at: addDays(D, -14) + 'T23:59:59.999999Z', count: 2 }, // just outside 14
        { at: addDays(D, -1) + 'T00:00:00.000001Z', count: 3 },
        { at: D + 'T12:00:00Z' },
        { at: addDays(D, 2) + 'T00:00:00Z' }, // future
      ]);
      const s14 = await getStatsOk(l.code, '?days=14');
      expect(s14.daily[0]).toEqual({ date: addDays(D, -13), clicks: 1 });
      expect(s14.daily[12]).toEqual({ date: addDays(D, -1), clicks: 3 });
      expect(s14.daily[13]).toEqual({ date: D, clicks: 1 });
      expect([s14.rangeClicks, s14.totalClicks]).toEqual([5, 8]);
      const s2 = await getStatsOk(l.code, '?days=2');
      expect(s2.daily).toEqual([{ date: addDays(D, -1), clicks: 3 }, { date: D, clicks: 1 }]);
      expect((await getLinkOk(l.code)).clickCount).toBe(8);
    });
  });

  test('[R-DATA-1][R-GET-1][R-STATS-5][gray-box] inserted rows show up at once with exact precision and window-only breakdowns', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    await anchoredToToday(async (D) => {
      const l = await createOk({ url: `https://example.org/gd/${uid()}` });
      const last = addDays(D, -1) + 'T23:59:59.000001Z';
      await seedClicks(l.code, [
        { at: last, referrer: 'in.example', country: 'IE', device: 'mobile' },
        { at: addDays(D, -40) + 'T00:00:00Z', referrer: 'out.example', country: 'IS', device: 'bot', count: 4 },
      ]);
      const g = await getLinkOk(l.code);
      expect(micros(g.lastClickedAt!)).toBe(micros(last));
      const s = await getStatsOk(l.code, '?days=30');
      expect(s.topReferrers).toEqual([{ name: 'in.example', clicks: 1 }]);
      expect(s.topCountries).toEqual([{ name: 'IE', clicks: 1 }]);
      expect(s.devices).toEqual([{ name: 'mobile', clicks: 1 }]);
      expect(s.totalClicks).toBe(5);
    });
  });
});
