import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { alias, createOk, enc, uid, uurl } from '../../lib/links.ts';
import { alertRegion, expect, form, gotoWithLink, rowFor, shortLinkIn, test } from './fixtures.ts';

/** R-UI-10: default axe rules, zero serious or critical violations. */
async function expectNoSeriousViolations(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `axe in state: ${state}`).toEqual([]);
}

test.describe('accessibility', () => {
  test('[R-UI-10] / with an empty form', async ({ page }) => {
    await page.goto('/');
    await expect(form(page).shorten).toBeVisible();
    await expectNoSeriousViolations(page, 'empty form');
  });

  test('[R-UI-10] / after a success', async ({ page }) => {
    await page.goto('/');
    await form(page).dest.fill(uurl('a11y'));
    await form(page).shorten.click();
    await expect(shortLinkIn(page)).toHaveCount(1);
    await expectNoSeriousViolations(page, 'after success');
  });

  test('[R-UI-10] / after an error', async ({ page }) => {
    await page.goto('/');
    await form(page).dest.fill(`ftp://example.com/${uid()}`);
    await form(page).shorten.click();
    await expect(alertRegion(page)).toHaveCount(1);
    await expectNoSeriousViolations(page, 'after error');
  });

  test('[R-UI-10] / with a delete confirmation revealed', async ({ page }) => {
    const l = await gotoWithLink(page, { url: uurl('a11yd'), alias: alias('a11yd') });
    await rowFor(page, l.code).getByRole('button', { name: `Delete ${l.code}`, exact: true }).click();
    await expect(rowFor(page, l.code).getByRole('button', { name: 'Confirm delete', exact: true })).toBeVisible();
    await expectNoSeriousViolations(page, 'delete confirmation');
  });

  test('[R-UI-10] /links/{code} for each days link', async ({ page }) => {
    const l = await createOk({ url: uurl('a11ys'), alias: alias('a11ys') });
    for (const days of [7, 30, 90]) {
      await page.goto(`/links/${enc(l.code)}?days=${days}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(l.code);
      await expectNoSeriousViolations(page, `/links/{code}?days=${days}`);
    }
  });

  test('[R-UI-10] /links/{unknown}', async ({ page }) => {
    await page.goto(`/links/nope-${uid()}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Link not found', exact: true })).toBeVisible();
    await expectNoSeriousViolations(page, '/links/{unknown}');
  });
});
