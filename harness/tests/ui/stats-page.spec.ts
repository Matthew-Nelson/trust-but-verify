import type { Page } from '@playwright/test';
import { COUNTRY_HEADER, GRAY_SKIP, TARGET_WEB, hasDb } from '../../lib/config.ts';
import { alias, createOk, del, enc, followRaw, getStatsOk, uid, uurl, waitForRangeClicks, type Stats } from '../../lib/links.ts';
import { dbNow, seedClicks } from '../../lib/db.ts';
import { bodyRows, cells, columnHeaders, expect, headerRows, test } from './fixtures.ts';

const table = (page: Page, name: string) => page.getByRole('table', { name, exact: true });

async function expectTableMatches(page: Page, name: string, headers: string[], rows: [string, string][]): Promise<void> {
  const t = table(page, name);
  await expect(t, `table "${name}"`).toHaveCount(1);
  await expect(headerRows(page, t)).toHaveCount(1);
  expect(await columnHeaders(t)).toEqual(headers);
  const body = bodyRows(page, t);
  await expect(body).toHaveCount(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const c = cells(body.nth(i));
    await expect(c.nth(0)).toHaveText(rows[i][0]);
    await expect(c.nth(1)).toHaveText(rows[i][1]);
  }
}

async function expectPageMatchesStats(page: Page, s: Stats): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toContainText(s.code);
  await expect(page.getByText(`Total clicks: ${s.totalClicks}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Clicks in range: ${s.rangeClicks}`, { exact: true })).toBeVisible();
  await expectTableMatches(page, 'Clicks per day', ['Date', 'Clicks'], s.daily.map((d) => [d.date, String(d.clicks)]));
  await expectTableMatches(page, 'Top referrers', ['Name', 'Clicks'], s.topReferrers.map((e) => [e.name, String(e.clicks)]));
  await expectTableMatches(page, 'Top countries', ['Name', 'Clicks'], s.topCountries.map((e) => [e.name, String(e.clicks)]));
  await expectTableMatches(page, 'Devices', ['Name', 'Clicks'], s.devices.map((e) => [e.name, String(e.clicks)]));
}

async function linkWithClicks() {
  const l = await createOk({ url: uurl('ui7'), alias: alias('ui7') });
  const plan: string[][] = [
    ['Referer', 'https://news.example/a', COUNTRY_HEADER, 'us', 'User-Agent', 'Mozilla/5.0 (iPhone)'],
    ['Referer', 'https://news.example/b', COUNTRY_HEADER, 'us', 'User-Agent', 'Mozilla/5.0 (Windows NT 10.0)'],
    ['User-Agent', 'Googlebot/2.1'],
  ];
  let t = 0;
  for (const h of plan) t = (await followRaw(l.code, h)).headersAt;
  await waitForRangeClicks(l.code, 3, t);
  return l;
}

test.describe('stats page /links/{code}', () => {
  test('[R-UI-7] heading, totals and the four tables match the API stats (default window)', async ({ page }) => {
    const l = await linkWithClicks();
    await page.goto(`/links/${enc(l.code)}`);
    await expectPageMatchesStats(page, await getStatsOk(l.code, '?days=30'));
  });

  test('[R-UI-7] a link with no clicks: zero totals and breakdown tables with a header row and no body rows', async ({ page }) => {
    const l = await createOk({ url: uurl('ui7e'), alias: alias('ui7e') });
    await page.goto(`/links/${enc(l.code)}`);
    const s = await getStatsOk(l.code);
    expect(s.totalClicks).toBe(0);
    await expectPageMatchesStats(page, s);
  });

  test('[R-UI-7][gray-box] totals are base-10 integers without separators', async ({ page }) => {
    test.skip(!hasDb, GRAY_SKIP);
    const l = await createOk({ url: uurl('ui7g'), alias: alias('ui7g') });
    const { today } = await dbNow();
    await seedClicks(l.code, [{ at: `${today}T00:00:00Z`, count: 1234, referrer: 'big.example', country: 'NL', device: 'desktop' }]);
    await page.goto(`/links/${enc(l.code)}`);
    await expect(page.getByText('Total clicks: 1234', { exact: true })).toBeVisible();
    await expect(page.getByText('Clicks in range: 1234', { exact: true })).toBeVisible();
  });

  test('[R-UI-8] the 7/30/90 days links set ?days= and the matching one has aria-current="page"', async ({ page }) => {
    const l = await linkWithClicks();
    for (const days of [7, 30, 90]) {
      await page.goto(`/links/${enc(l.code)}`);
      const link = page.getByRole('link', { name: `${days} days`, exact: true });
      const href = new URL((await link.getAttribute('href'))!, `${TARGET_WEB}/links/${enc(l.code)}`);
      expect(href.pathname).toBe(`/links/${enc(l.code)}`);
      expect(href.searchParams.getAll('days')).toEqual([String(days)]);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`[?&]days=${days}(&|$)`));
      await expect(bodyRows(page, table(page, 'Clicks per day'))).toHaveCount(days);
      for (const other of [7, 30, 90]) {
        const o = page.getByRole('link', { name: `${other} days`, exact: true });
        if (other === days) await expect(o).toHaveAttribute('aria-current', 'page');
        else expect(await o.getAttribute('aria-current')).not.toBe('page');
      }
      await expectPageMatchesStats(page, await getStatsOk(l.code, `?days=${days}`));
    }
  });

  test('[R-UI-8] a valid days without a link is honored (1 and 365) and no link is current', async ({ page }) => {
    const l = await createOk({ url: uurl('ui8v'), alias: alias('ui8v') });
    for (const days of [1, 365]) {
      await page.goto(`/links/${enc(l.code)}?days=${days}`);
      await expect(bodyRows(page, table(page, 'Clicks per day'))).toHaveCount(days);
      for (const n of [7, 30, 90]) expect(await page.getByRole('link', { name: `${n} days`, exact: true }).getAttribute('aria-current')).not.toBe('page');
    }
  });

  test('[R-UI-8] missing or invalid days behaves exactly like days=30, including aria-current on "30 days"', async ({ page }) => {
    const l = await linkWithClicks();
    const s30 = await getStatsOk(l.code, '?days=30');
    for (const q of ['', '?days=0', '?days=366', '?days=abc', '?days=07', '?days=-1', '?days=1.5', '?days=', '?days=7&days=7', '?days=%2B7']) {
      await page.goto(`/links/${enc(l.code)}${q}`);
      await expect(bodyRows(page, table(page, 'Clicks per day')), `query ${q}`).toHaveCount(30);
      await expect(page.getByRole('link', { name: '30 days', exact: true })).toHaveAttribute('aria-current', 'page');
      for (const n of [7, 90]) expect(await page.getByRole('link', { name: `${n} days`, exact: true }).getAttribute('aria-current')).not.toBe('page');
      await expect(page.getByText(`Clicks in range: ${s30.rangeClicks}`, { exact: true })).toBeVisible();
    }
  });

  test('[R-UI-9] an unknown code responds 404 with the level-1 heading "Link not found"', async ({ page }) => {
    const resp = await page.goto(`/links/nope-${uid()}`);
    expect(resp!.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Link not found', exact: true })).toBeVisible();
  });

  test('[R-UI-9][R-DEL-1] a deleted link\'s page responds 404 "Link not found"', async ({ page }) => {
    const l = await createOk({ url: uurl('ui9'), alias: alias('ui9') });
    expect((await page.goto(`/links/${enc(l.code)}`))!.status()).toBe(200);
    expect((await del(l.code)).status).toBe(204);
    const resp = await page.goto(`/links/${enc(l.code)}`);
    expect(resp!.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Link not found', exact: true })).toBeVisible();
  });
});
