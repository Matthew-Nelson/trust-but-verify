import { expect, test } from 'vitest';
import { alias, createOk, follow, getLinkOk, getStatsOk, sleepUntil, uurl } from '../../lib/links.ts';

test('[R-REDIR-5] 500 GET /{code} with >= 100 in flight: all 302, clickCount = start + 500 at 2 s and again at 4 s', async () => {
  const l = await createOk({ url: uurl('burst'), alias: alias('burst') });
  const start = (await getLinkOk(l.code)).clickCount;
  const TOTAL = 500;
  const CONCURRENCY = 125;
  let inFlight = 0;
  let maxInFlight = 0;
  let next = 0;
  const statuses: number[] = [];
  const locations = new Set<string>();
  let lastResponseAt = 0;
  // Release all workers together so >= 100 requests are in flight at once.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    await gate;
    while (next < TOTAL) {
      next++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const r = await follow(l.code);
      inFlight--;
      statuses.push(r.status);
      locations.add(r.headers['location'] ?? '');
      lastResponseAt = Math.max(lastResponseAt, r.headersAt);
    }
  });
  release();
  await Promise.all(workers);
  expect(statuses).toHaveLength(TOTAL);
  expect(maxInFlight, 'harness must keep >= 100 requests in flight').toBeGreaterThanOrEqual(100);
  expect(statuses.filter((s) => s !== 302), 'non-302 statuses').toEqual([]);
  expect([...locations]).toEqual([l.url]);
  await sleepUntil(lastResponseAt, 2000);
  expect((await getLinkOk(l.code)).clickCount).toBe(start + TOTAL);
  await sleepUntil(lastResponseAt, 4000);
  expect((await getLinkOk(l.code)).clickCount).toBe(start + TOTAL);
  expect((await getStatsOk(l.code)).totalClicks).toBe(start + TOTAL);
});
