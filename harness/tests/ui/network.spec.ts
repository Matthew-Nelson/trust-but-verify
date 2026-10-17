// R-UI-11 is enforced on every UI test by the auto fixture in fixtures.ts. This test walks a whole
// journey (create, stats, days switch, delete, error) so the check sees every UI code path at least once.
import { alias, enc, uurl } from '../../lib/links.ts';
import { alertRegion, expect, form, rowFor, statusRegion, test } from './fixtures.ts';

test('[R-UI-11] a full create -> stats -> delete -> error journey sends no browser request to /api/', async ({ page, apiRequests }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(r.url()));
  const a = alias('net');
  await page.goto('/');
  await form(page).dest.fill(uurl('net'));
  await form(page).alias.fill(a);
  await form(page).shorten.click();
  await expect(statusRegion(page).getByRole('link')).toHaveCount(1);
  await page.getByRole('link', { name: `Stats for ${a}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/links/${enc(a)}`));
  await page.getByRole('link', { name: '7 days', exact: true }).click();
  await expect(page).toHaveURL(/days=7/);
  await page.goto('/');
  await rowFor(page, a).getByRole('button', { name: `Delete ${a}`, exact: true }).click();
  await rowFor(page, a).getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(rowFor(page, a)).toHaveCount(0, { timeout: 2000 });
  await form(page).dest.fill('ftp://example.com/');
  await form(page).shorten.click();
  await expect(alertRegion(page)).toHaveCount(1);
  expect(seen.length).toBeGreaterThan(0); // the capture is live
  expect(apiRequests).toEqual([]);
});
