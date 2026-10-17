import { GRAY_SKIP, PUBLIC_BASE_URL, TARGET_WEB, hasDb } from '../../lib/config.ts';
import { api } from '../../lib/http.ts';
import { alias, createOk, follow, getLink, uid, uurl, waitForClickCount } from '../../lib/links.ts';
import { db, dbNow, seedClicks } from '../../lib/db.ts';
import {
  MSG, alertRegion, apiLink, bodyRows, cells, columnHeaders, createdCode, expect, expectNoReload, form, formatCreated,
  gotoWithLink, headerRows, linksTable, markDocument, rowFor, statusRegion, tableCodes, test,
} from './fixtures.ts';

test.describe('home page /', () => {
  test('[R-UI-1] form has the Destination URL and Custom alias (optional) textboxes and a Shorten button, with no constraint validation', async ({ page }) => {
    await page.goto('/');
    const f = form(page);
    await expect(f.dest).toBeVisible();
    await expect(f.alias).toBeVisible();
    await expect(f.shorten).toBeVisible();
    const info = await f.dest.evaluate((el) => {
      const formEl = (el as HTMLInputElement).form;
      return {
        hasForm: !!formEl,
        noValidate: formEl?.noValidate ?? false,
        controls: formEl ? [...formEl.elements].map((e) => ({ type: (e as HTMLInputElement).type, required: (e as HTMLInputElement).required })) : [],
      };
    });
    expect(info.hasForm).toBe(true);
    expect(info.noValidate).toBe(true);
    for (const c of info.controls) {
      expect(c.type).not.toBe('url');
      expect(c.required).toBe(false);
    }
    // Both textboxes and the button belong to the same form.
    const formOf = (l: typeof f.dest) => l.evaluate((el) => {
      const fm = (el as HTMLInputElement).form;
      return fm ? [...document.forms].indexOf(fm) : -1;
    });
    const idx = await formOf(f.dest);
    expect(await formOf(f.alias)).toBe(idx);
    expect(await formOf(f.shorten)).toBe(idx);
  });

  const normalizations: [string, string, (id: string) => string, (id: string) => string][] = [
    ['bare host gets https://', 'normative', () => 'example.com', () => 'https://example.com/'],
    ['bare host and path gets https://', 'path', (id) => `example.com/ui-${id}`, (id) => `https://example.com/ui-${id}`],
    ['an explicit upper-case scheme is sent unchanged', 'scheme', (id) => `HTTP://x.com/${id}`, (id) => `http://x.com/${id}`],
    ['host:port without a scheme gets https://', 'port', (id) => `example.com:8443/x${id}`, (id) => `https://example.com:8443/x${id}`],
    ['surrounding ASCII whitespace is trimmed', 'trim', (id) => `  \t example.org/p${id} \t `, (id) => `https://example.org/p${id}`],
  ];
  for (const [label, , input, want] of normalizations) {
    test(`[R-UI-2] destination: ${label}`, async ({ page }) => {
      const id = uid();
      await page.goto('/');
      const f = form(page);
      await f.dest.fill(input(id));
      await f.shorten.click();
      const { code } = await createdCode(page);
      expect((await apiLink(code)).url).toBe(want(id));
    });
  }

  test('[R-UI-2] the alias field is trimmed; a whitespace-only alias is omitted (generated code)', async ({ page }) => {
    const a = alias('ui2');
    await page.goto('/');
    const f = form(page);
    await f.dest.fill(uurl('ui2'));
    await f.alias.fill(`  ${a}\t `);
    await f.shorten.click();
    expect((await createdCode(page)).code).toBe(a);

    await page.goto('/');
    await f.dest.fill(uurl('ui2b'));
    await f.alias.fill('   ');
    await f.shorten.click();
    const { code } = await createdCode(page);
    expect(code).toMatch(/^[A-Za-z0-9]{7}$/);
    expect((await apiLink(code)).isCustom).toBe(false);
  });

  test('[R-UI-3] success shows a status with a link to the shortUrl and a working "Copy short link" button', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(TARGET_WEB).origin });
    const a = alias('ui3');
    const url = uurl('ui3');
    await page.goto('/');
    const f = form(page);
    await f.dest.fill(url);
    await f.alias.fill(a);
    await f.shorten.click();
    const shortUrl = `${PUBLIC_BASE_URL}/${a}`;
    const link = statusRegion(page).getByRole('link', { name: shortUrl, exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', shortUrl);
    expect((await apiLink(a)).shortUrl).toBe(shortUrl);
    await statusRegion(page).getByRole('button', { name: 'Copy short link', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(shortUrl);
  });

  const errors: [string, (id: string) => { url: string; alias?: string }, keyof typeof MSG][] = [
    ['invalid alias', () => ({ url: uurl('ui4'), alias: 'a!' }), 'invalid_alias'],
    ['reserved alias (mixed case)', () => ({ url: uurl('ui4'), alias: 'Admin' }), 'alias_reserved'],
    ['unsupported scheme', (id) => ({ url: `ftp://example.com/${id}` }), 'invalid_url'],
    ['URL over 2048 code points', (id) => ({ url: `https://example.com/${id}/${'a'.repeat(2048)}` }), 'invalid_url'],
  ];
  for (const [label, mk, code] of errors) {
    test(`[R-UI-4] API error (${label}) shows exactly the ${code} message in an alert`, async ({ page }) => {
      const input = mk(uid());
      await page.goto('/');
      const f = form(page);
      await f.dest.fill(input.url);
      if (input.alias) await f.alias.fill(input.alias);
      await f.shorten.click();
      await expect(alertRegion(page)).toHaveText(MSG[code]);
    });
  }

  test('[R-UI-4] taken alias shows exactly the alias_taken message', async ({ page }) => {
    const a = alias('ui4t');
    await createOk({ url: uurl('ui4t'), alias: a });
    await page.goto('/');
    const f = form(page);
    await f.dest.fill(uurl('ui4t2'));
    await f.alias.fill(a);
    await f.shorten.click();
    await expect(alertRegion(page)).toHaveText(MSG.alias_taken);
  });

  test('[R-UI-5] "Your links" table: exactly one header row with Short link, Destination, Clicks, Created', async ({ page }) => {
    await gotoWithLink(page, { url: uurl('ui5h') });
    const table = linksTable(page);
    await expect(table).toHaveCount(1);
    await expect(headerRows(page, table)).toHaveCount(1);
    expect((await columnHeaders(table)).slice(0, 4)).toEqual(['Short link', 'Destination', 'Clicks', 'Created']);
  });

  test('[R-UI-5] the table lists the 20 newest links in API order', async ({ page }) => {
    for (let i = 0; i < 3; i++) await createOk({ url: uurl('ui5o') });
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await newest20();
      await page.goto('/');
      const shown = await tableCodes(page);
      const after = await newest20();
      if (JSON.stringify(before) !== JSON.stringify(after) && attempt < 2) continue; // list changed underneath
      expect(shown).toEqual(after);
      expect(shown.length).toBeLessThanOrEqual(20);
      return;
    }
  });

  test('[R-UI-5] row cells: shortUrl link, url, clickCount as a plain integer, createdAt as UTC YYYY-MM-DD HH:MM; Stats and Delete controls', async ({ page }) => {
    const l0 = await createOk({ url: `https://example.com/ui5c/${uid()}?q=1`, alias: alias('ui5c') });
    let t = 0;
    for (let i = 0; i < 2; i++) t = (await follow(l0.code)).headersAt;
    await waitForClickCount(l0.code, 2, t);
    const l = await gotoWithLink(page, { url: l0.url, alias: l0.code }, l0);
    const row = rowFor(page, l.code);
    const c = cells(row);
    const link = c.nth(0).getByRole('link', { name: l.shortUrl, exact: true });
    await expect(link).toHaveAttribute('href', l.shortUrl);
    await expect(c.nth(1)).toHaveText(l.url);
    await expect(c.nth(2)).toHaveText((await apiLink(l.code)).clickCount.toString());
    await expect(c.nth(3)).toHaveText(formatCreated(l.createdAt));
    await expect(row.getByRole('link', { name: `Stats for ${l.code}`, exact: true })).toHaveAttribute('href', new RegExp(`/links/${encodeURIComponent(l.code)}$`));
    await expect(row.getByRole('button', { name: `Delete ${l.code}`, exact: true })).toHaveCount(1);
  });

  test('[R-UI-5][gray-box] Clicks has no thousands separator and Created truncates seconds (hh:mm:59.9 is not rounded up)', async ({ page }) => {
    test.skip(!hasDb, GRAY_SKIP);
    const l = await createOk({ url: uurl('ui5g'), alias: alias('ui5g') });
    const { today } = await dbNow();
    await db().query(`UPDATE links SET created_at = date_trunc('minute', now()) + interval '59.9 seconds' WHERE code = $1`, [l.code]);
    await seedClicks(l.code, [{ at: `${today}T00:00:00Z`, count: 1234 }]);
    const fresh = await apiLink(l.code);
    expect(fresh.createdAt.slice(17, 19)).toBe('59');
    await gotoWithLink(page, { url: l.url }, fresh);
    const c = cells(rowFor(page, l.code));
    await expect(c.nth(2)).toHaveText('1234');
    await expect(c.nth(3)).toHaveText(formatCreated(fresh.createdAt));
  });

  test('[R-UI-5] after a successful create the table is re-fetched without a full page reload', async ({ page }) => {
    await page.goto('/');
    await markDocument(page);
    const a = alias('ui5r');
    const f = form(page);
    await f.dest.fill(uurl('ui5r'));
    await f.alias.fill(a);
    await f.shorten.click();
    await expect(rowFor(page, a)).toHaveCount(1);
    await expectNoReload(page);
  });

  test('[R-UI-6] Delete reveals "Confirm delete" in the same row; only one open at a time; nothing deleted until confirmed', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d.type());
      void d.dismiss();
    });
    const a = await createOk({ url: uurl('ui6'), alias: alias('ui6a') });
    const b = await gotoWithLink(page, { url: uurl('ui6'), alias: alias('ui6b') });
    await page.goto('/');
    await expect(rowFor(page, a.code)).toHaveCount(1);
    await markDocument(page);
    const confirm = (code: string) => rowFor(page, code).getByRole('button', { name: 'Confirm delete', exact: true });

    await rowFor(page, a.code).getByRole('button', { name: `Delete ${a.code}`, exact: true }).click();
    await expect(confirm(a.code)).toBeVisible();
    expect((await getLink(a.code)).status).toBe(200);

    await rowFor(page, b.code).getByRole('button', { name: `Delete ${b.code}`, exact: true }).click();
    await expect(confirm(b.code)).toBeVisible();
    await expect(confirm(a.code)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirm delete', exact: true })).toHaveCount(1);
    expect((await getLink(a.code)).status).toBe(200);
    expect((await getLink(b.code)).status).toBe(200);

    await confirm(b.code).click();
    await expect(rowFor(page, b.code)).toHaveCount(0, { timeout: 2000 });
    await expect.poll(async () => (await getLink(b.code)).status, { timeout: 2000 }).toBe(404);
    expect((await getLink(a.code)).status).toBe(200);
    await expect(rowFor(page, a.code)).toHaveCount(1);
    await expectNoReload(page);
    expect(dialogs, 'native dialogs were opened').toEqual([]);
  });

  test('[R-UI-12] an empty or whitespace-only destination shows the invalid_url alert and sends no network request', async ({ page }) => {
    for (const value of ['', '  \t  ']) {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const requests: string[] = [];
      const onReq = (r: { method(): string; url(): string }) => requests.push(`${r.method()} ${r.url()}`);
      page.on('request', onReq);
      const f = form(page);
      await f.dest.fill(value);
      await f.shorten.click();
      await expect(alertRegion(page)).toHaveText(MSG.invalid_url);
      await page.waitForTimeout(1000);
      page.off('request', onReq);
      expect(requests, `requests after submitting ${JSON.stringify(value)}`).toEqual([]);
    }
  });
});

async function newest20(): Promise<string[]> {
  const r = await api('GET', '/api/links?limit=20');
  return r.json.items.map((l: { code: string }) => l.code);
}
