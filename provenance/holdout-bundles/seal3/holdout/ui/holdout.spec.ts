// Holdout UI: same R-UI rules, other inputs. Reuses the public fixtures (R-UI-11 auto-check included).
import AxeBuilder from '@axe-core/playwright';
import { apiToday, createOk, del, enc, follow, getLink, getStatsOk, retryIfDayChanged, uid, waitForClickCount } from '../../harness/lib/links.ts';
import {
  MSG, alertRegion, apiLink, bodyRows, cells, createdCode, expect, form, formatCreated, gotoWithLink, rowFor, test,
} from '../../harness/tests/ui/fixtures.ts';

const u = (tag: string) => `https://example.org/${tag}/${uid(9)}`;

test('[R-UI-1] the three controls are present and the form has novalidate', async ({ page }) => {
  await page.goto('/');
  const f = form(page);
  await expect(f.shorten).toBeEnabled();
  expect(await f.alias.evaluate((el) => (el as HTMLInputElement).form?.noValidate)).toBe(true);
  for (const box of [f.dest, f.alias]) {
    const [type, required] = await box.evaluate((el) => [(el as HTMLInputElement).type, (el as HTMLInputElement).required] as const);
    expect(type).not.toBe('url');
    expect(required).toBe(false);
  }
});

for (const [label, input, want] of [
  ['mixed-case bare host', (id: string) => `Example.COM/path-${id}`, (id: string) => `https://example.com/path-${id}`],
  ['explicit https kept', (id: string) => `https://example.net/${id}`, (id: string) => `https://example.net/${id}`],
  ['no "://" means a prefix even with a colon', (id: string) => `mailto:${id}@y.z`, (id: string) => `https://mailto:${id}@y.z/`],
] as const) {
  test(`[R-UI-2] destination ${label}`, async ({ page }) => {
    const id = uid(8);
    await page.goto('/');
    await form(page).dest.fill(`\n${input(id)} `);
    await form(page).shorten.click();
    expect((await apiLink((await createdCode(page)).code)).url).toBe(want(id));
  });
}

test('[R-UI-3] the status link points at the new shortUrl for a generated code', async ({ page }) => {
  await page.goto('/');
  await form(page).dest.fill(u('h3'));
  await form(page).shorten.click();
  const { code, shortUrl } = await createdCode(page);
  expect((await apiLink(code)).shortUrl).toBe(shortUrl);
});

for (const [label, alias, url, code] of [
  ['too-short alias', 'ab', null, 'invalid_alias'],
  ['reserved LOGOUT', 'LOGOUT', null, 'alias_reserved'],
  ['gopher scheme', null, 'gopher://example.com/x', 'invalid_url'],
] as const) {
  test(`[R-UI-4] ${label} shows the ${code} message`, async ({ page }) => {
    await page.goto('/');
    await form(page).dest.fill(url ?? u('h4'));
    if (alias) await form(page).alias.fill(alias);
    await form(page).shorten.click();
    await expect(alertRegion(page)).toHaveText(MSG[code]);
  });
}

test('[R-UI-5] a link with clicks shows its count and created time in its row', async ({ page }) => {
  const l0 = await createOk({ url: u('h5'), alias: `h5-${uid(6)}` });
  const r = await follow(l0.code);
  await waitForClickCount(l0.code, 1, r.headersAt);
  const l = await gotoWithLink(page, { url: l0.url, alias: l0.code }, l0);
  const c = cells(rowFor(page, l.code));
  await expect(c.nth(2)).toHaveText('1');
  await expect(c.nth(3)).toHaveText(formatCreated(l.createdAt));
});

test('[R-UI-6] confirming the delete of a generated-code link removes it from the table and the api', async ({ page }) => {
  const l = await gotoWithLink(page, { url: u('h6') });
  await rowFor(page, l.code).getByRole('button', { name: `Delete ${l.code}`, exact: true }).click();
  await rowFor(page, l.code).getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(rowFor(page, l.code)).toHaveCount(0, { timeout: 2000 });
  await expect.poll(async () => (await getLink(l.code)).status, { timeout: 2000 }).toBe(404);
});

test('[R-UI-7][R-UI-8] days=7 page matches the API; %37 is the query integer 7', async ({ page }) => {
  const l = await createOk({ url: u('h7'), alias: `h7-${uid(6)}` });
  const r = await follow(l.code);
  await waitForClickCount(l.code, 1, r.headersAt);
  await retryIfDayChanged(() => apiToday(l.code), async () => {
    const s = await getStatsOk(l.code, '?days=7');
    for (const q of ['?days=7', '?days=%37']) {
      await page.goto(`/links/${enc(l.code)}${q}`);
      await expect(page.getByText(`Total clicks: ${s.totalClicks}`, { exact: true })).toBeVisible();
      const rows = bodyRows(page, page.getByRole('table', { name: 'Clicks per day', exact: true }));
      await expect(rows).toHaveCount(7);
      await expect(cells(rows.nth(6)).nth(0)).toHaveText(s.daily[6].date);
      await expect(page.getByRole('link', { name: '7 days', exact: true })).toHaveAttribute('aria-current', 'page');
    }
  });
});

test('[R-UI-8] days=08, days=1e1 and days=366 fall back to 30', async ({ page }) => {
  const l = await createOk({ url: u('h8'), alias: `h8-${uid(6)}` });
  for (const q of ['08', '1e1', '366']) {
    await page.goto(`/links/${enc(l.code)}?days=${q}`);
    await expect(bodyRows(page, page.getByRole('table', { name: 'Clicks per day', exact: true }))).toHaveCount(30);
    await expect(page.getByRole('link', { name: '30 days', exact: true })).toHaveAttribute('aria-current', 'page');
  }
});

test('[R-UI-9][R-DEL-1] a 64-character unknown code and a just-deleted code both give 404 "Link not found"', async ({ page }) => {
  const l = await createOk({ url: u('h9'), alias: `h9-${uid(6)}` });
  await del(l.code);
  for (const code of ['k'.repeat(64), l.code]) {
    const resp = await page.goto(`/links/${enc(code)}`);
    expect(resp!.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Link not found', exact: true })).toBeVisible();
  }
});

test('[R-UI-10] axe: after an invalid-alias error and on /links/{code}?days=90', async ({ page }) => {
  await page.goto('/');
  await form(page).dest.fill(u('h10'));
  await form(page).alias.fill('x');
  await form(page).shorten.click();
  await expect(alertRegion(page)).toHaveText(MSG.invalid_alias);
  const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => v.id)).toEqual([]);
  const l = await createOk({ url: u('h10b'), alias: `h10-${uid(6)}` });
  await page.goto(`/links/${enc(l.code)}?days=90`);
  const bad2 = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad2.map((v) => v.id)).toEqual([]);
});

test('[R-UI-12] a destination of only newline and tab shows the invalid_url alert with no navigation and no non-GET/HEAD request', async ({ page }) => {
  await page.goto('/');
  await expect(form(page).shorten).toBeVisible();
  await form(page).dest.fill('\n\t');
  await form(page).alias.fill(`h12-${uid(6)}`);
  const offending: string[] = [];
  page.on('request', (r) => {
    if (r.isNavigationRequest() || (r.method() !== 'GET' && r.method() !== 'HEAD')) offending.push(`${r.method()} ${r.url()}`);
  });
  await form(page).shorten.click();
  await expect(alertRegion(page)).toHaveText(MSG.invalid_url);
  await page.waitForTimeout(1000);
  expect(offending).toEqual([]);
});
