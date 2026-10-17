import { describe, expect, test } from 'vitest';
import { api, mediaType, rawSocket } from '../../lib/http.ts';

describe('GET /healthz', () => {
  test('[R-HEALTH-1][R-ERR-8] with the database reachable, GET (and HEAD) -> 200 application/json body exactly {"status":"ok"} within 3 s', async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => api('GET', '/healthz')));
    for (const r of rs) {
      expect(r.status).toBe(200);
      expect(mediaType(r)).toBe('application/json');
      expect(r.json).toEqual({ status: 'ok' });
      expect(r.ms).toBeLessThan(3000);
    }
    // HEAD mirrors it (R-ERR-8): same status and Content-Type, no body bytes.
    const head = await api('HEAD', '/healthz');
    expect(head.status).toBe(200);
    expect(head.headers['content-type']).toBe(rs[0].headers['content-type']);
    expect((await rawSocket('HEAD', '/healthz')).afterHeaders.length).toBe(0);
  });
});
