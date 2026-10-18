// Shared UI fixtures. Elements are selected only by role and accessible name (R-UI contract).
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { PUBLIC_BASE_URL, TARGET_WEB } from '../../lib/config.ts';
import { createOk, getLinkOk, type Link } from '../../lib/links.ts';

/** R-UI-11: every UI test records browser requests and fails if any targets an /api/ path. */
export const test = base.extend<{ apiRequests: string[] }>({
  apiRequests: [
    async ({ context }, use) => {
      const hits: string[] = [];
      context.on('request', (req) => {
        try {
          const u = new URL(req.url());
          if (u.pathname.startsWith('/api/') || u.pathname === '/api') hits.push(`${req.method()} ${req.url()}`);
        } catch {}
      });
      await use(hits);
      expect(hits, '[R-UI-11] the browser sent requests to /api/ paths').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const MSG = {
  invalid_url: 'Enter a valid http or https URL.',
  invalid_alias: 'Aliases are 3 to 32 letters, numbers, hyphens or underscores.',
  alias_reserved: 'That alias is reserved. Try another.',
  alias_taken: 'That alias is taken. Try another.',
  other: 'Something went wrong. Please try again.',
};

export function form(page: Page) {
  return {
    dest: page.getByRole('textbox', { name: 'Destination URL', exact: true }),
    alias: page.getByRole('textbox', { name: 'Custom alias (optional)', exact: true }),
    shorten: page.getByRole('button', { name: 'Shorten', exact: true }),
  };
}

/** Non-empty live regions (frameworks may render empty route announcers with these roles). */
export const statusRegion = (page: Page) => page.getByRole('status').filter({ hasText: /\S/ });
export const alertRegion = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });

export const linksTable = (page: Page) => page.getByRole('table', { name: 'Your links', exact: true });

export function headerRows(page: Page, table: Locator): Locator {
  return table.getByRole('row').filter({ has: page.getByRole('columnheader') });
}
export function bodyRows(page: Page, table: Locator): Locator {
  return table.getByRole('row').filter({ hasNot: page.getByRole('columnheader') });
}
export function rowFor(page: Page, code: string): Locator {
  return linksTable(page).getByRole('row').filter({ has: page.getByRole('link', { name: `Stats for ${code}`, exact: true }) });
}
/** Data cells of a row in DOM order (a row header counts as a cell). */
export function cells(row: Locator): Locator {
  return row.getByRole('cell').or(row.getByRole('rowheader'));
}
export async function columnHeaders(table: Locator): Promise<string[]> {
  return (await table.getByRole('columnheader').allInnerTexts()).map((s) => s.trim());
}

/** createdAt in UTC as YYYY-MM-DD HH:MM, seconds truncated (R-UI-5). */
export function formatCreated(createdAt: string): string {
  // Parsed as an instant, rendered in UTC; slicing to minutes truncates the seconds.
  return new Date(createdAt).toISOString().slice(0, 16).replace('T', ' ');
}

/** Codes of the body rows of "Your links", in order, read from each row's "Stats for {code}" link href. */
export async function tableCodes(page: Page): Promise<string[]> {
  const rows = bodyRows(page, linksTable(page));
  const n = await rows.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const href = await rows.nth(i).getByRole('link', { name: /^Stats for / }).getAttribute('href');
    out.push(decodeURIComponent(new URL(href!, TARGET_WEB).pathname.replace(/^\/links\//, '')));
  }
  return out;
}

/**
 * Load "/" and make sure `link` is listed. SPEC "Scheduling": a UI test whose link no longer appears
 * re-creates it, at most once.
 */
export async function gotoWithLink(page: Page, body: { url: string; alias?: string }, link?: Link): Promise<Link> {
  let l = link ?? (await createOk(body));
  await page.goto('/');
  if ((await rowFor(page, l.code).count()) === 0) {
    l = await createOk({ ...body, alias: body.alias ? `${body.alias}r` : undefined });
    await page.goto('/');
  }
  await expect(rowFor(page, l.code)).toHaveCount(1);
  return l;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The success short link inside the status region: the link whose accessible name starts with
 * PUBLIC_BASE_URL + "/" (R-UI-3). Other links in the region (e.g. "View stats") are ignored.
 */
export function shortLinkIn(page: Page): Locator {
  return statusRegion(page).getByRole('link', { name: new RegExp(`^${escapeRegExp(PUBLIC_BASE_URL)}/`) });
}

/** Read the short code from the success status link. */
export async function createdCode(page: Page): Promise<{ code: string; shortUrl: string }> {
  const link = shortLinkIn(page);
  await expect(link).toHaveCount(1);
  const shortUrl = (await link.getAttribute('href'))!;
  expect(shortUrl.startsWith(`${PUBLIC_BASE_URL}/`), `short link href ${shortUrl}`).toBe(true);
  return { code: decodeURIComponent(new URL(shortUrl).pathname.slice(1)), shortUrl };
}

export async function apiLink(code: string): Promise<Link> {
  return getLinkOk(code);
}

/** Mark the document so a full page reload can be detected. */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => ((window as any).__harnessMarker = 'kept'));
}
export async function expectNoReload(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as any).__harnessMarker), 'page was fully reloaded').toBe('kept');
}
