// Holdout: errors, routing, HEAD/OPTIONS, list, read/delete with different inputs.
import { describe, expect, test } from 'vitest';
import { api, raw, rawSocket, allowSet, mediaType } from '../../harness/lib/http.ts';
import { create, createOk, del, enc, findInList, follow, getLink, getStats, lazy, uid } from '../../harness/lib/links.ts';
import { expectError, expectNewLink, expectPlain404 } from '../../harness/lib/assert.ts';

const u = (tag: string) => `http://example.org/${tag}/${uid(9)}`;
const post = (body: string | Buffer, ct = 'application/json') => raw('POST', '/api/links', { body, headers: ['Content-Type', ct] });
const fixture = lazy(() => createOk({ url: u('fx'), alias: `Hx_${uid(8)}` }));

describe('holdout: R-ERR-2', () => {
  test('[R-ERR-2] other malformed bodies -> 400 bad_request', async () => {
    for (const b of ['   ', '{"url":', '[{"url":"https://example.com/"}]', 'false', '{"url":1.5}', '{"url":"https://example.com/","alias":0}', '{"url":"https://example.com/","alias":{"v":"abc"}}', '{"url":"https://example.com/\\udfff"}', '{"url":"https://example.com/"}{}']) {
      const r = await post(b);
      expect.soft([r.status, r.json?.error?.code], b).toEqual([400, 'bad_request']);
    }
  });

  test('[R-ERR-2] a lone UTF-8 continuation byte -> 400', async () => {
    expectError(await post(Buffer.concat([Buffer.from('{"url":"https://example.com/'), Buffer.from([0x80]), Buffer.from('"}')])), 400, 'bad_request');
  });

  test('[R-ERR-2] 65536 bytes with a different padding field is accepted; 65538 -> 400', async () => {
    const mk = (n: number) => {
      const head = `{"zzz":"`;
      const tail = `","url":"${u('big')}"}`;
      return head + 'q'.repeat(n - head.length - tail.length) + tail;
    };
    expect((await post(mk(65536))).status).toBe(201);
    expectError(await post(mk(65538)), 400, 'bad_request');
  });

  test('[R-ERR-2] precedence with other inputs', async () => {
    expectError(await create({ url: 'javascript:void(0)', alias: 'LOGIN' }), 422, 'invalid_url');
    expectError(await create({ url: u('p'), alias: 'logout!' }), 422, 'invalid_alias');
    expectError(await post('{"url":false,"alias":"!"}'), 400, 'bad_request');
    expectError(await create({ url: ' ', alias: (await fixture()).code }), 422, 'invalid_url');
  });

  test('[R-ERR-2] duplicate alias keys: the last (valid) one wins', async () => {
    const a = `dup_${uid(8)}`;
    const r = await post(`{"alias":"bad!","url":"${u('d')}","alias":"${a}"}`);
    expect(r.status).toBe(201);
    expect(r.json.code).toBe(a);
  });

  test.each(['application/xml', 'multipart/form-data; boundary=x'])('[R-ERR-2] Content-Type %s is ignored', async (ct) => {
    const url = u('ct');
    const r = await post(JSON.stringify({ url }), ct);
    expect(r.status).toBe(201);
    expectNewLink(r.json, { url });
  });
});

describe('holdout: R-ERR-3', () => {
  test('[R-ERR-3][R-LIST-1] other non-query-integer limit/offset values -> 400', async () => {
    for (const q of ['limit=00', 'limit=1_0', 'limit=%2D1', 'limit=10%20', 'offset=%2B1', 'offset=1e0', 'limit=1&limit=1', 'limit=100000']) {
      const r = await api('GET', `/api/links?${q}`);
      expect.soft(r.status, q).toBe(400);
    }
  });

  test('[R-ERR-3][R-LIST-2] limit=99 and offset=%32 are echoed', async () => {
    const r = await api('GET', '/api/links?limit=99&offset=%32');
    expect(r.status).toBe(200);
    expect([r.json.limit, r.json.offset]).toEqual([99, 2]);
  });

  test('[R-ERR-3][R-STATS-1] days=00, 365.0, %33%36%36 -> 400; %33%36%35 -> 365 entries', async () => {
    const c = enc((await fixture()).code);
    for (const q of ['days=00', 'days=365.0', 'days=%33%36%36', 'days=3&days=3']) expectError(await api('GET', `/api/links/${c}/stats?${q}`), 400, 'bad_request');
    const ok = await api('GET', `/api/links/${c}/stats?days=%33%36%35`);
    expect(ok.status).toBe(200);
    expect(ok.json.daily).toHaveLength(365);
  });
});

describe('holdout: R-ERR-4/5/6/8', () => {
  test('[R-ERR-4] probes in alias, url and path are not echoed', async () => {
    const p = `zq${uid(10)}`;
    expectError(await create({ url: `gopher://${p}/`, alias: p }), 422, 'invalid_url', [p]);
    expectError(await create({ url: u('e4'), alias: `${p}?` }), 422, 'invalid_alias', [p]);
    expectError(await api('GET', `/api/links/${p}/stats`), 404, 'not_found', [p]);
  });

  test('[R-ERR-5] other impossible codes -> 404 not_found; percent-decoded once', async () => {
    for (const c of ['___', '-', enc('é'), 'Z'.repeat(70)]) expectError(await api('GET', `/api/links/${c}`), 404, 'not_found');
    const id = uid(8);
    await createOk({ url: u('pd'), alias: `Ab-${id}` });
    const r = await api('GET', `/api/links/%41b-${id}`);
    expect(r.status).toBe(200);
    expect(r.json.code).toBe(`Ab-${id}`);
  });

  test('[R-ERR-6] other unmatched paths and 405 sets', async () => {
    expectError(await raw('POST', '/api/links/x/y'), 404, 'not_found');
    expectError(await raw('GET', '/api/linkz'), 404, 'not_found');
    const c = enc((await fixture()).code);
    for (const [m, p, allowed] of [
      ['PATCH', `/api/links/${c}/stats`, ['GET', 'HEAD']],
      ['DELETE', '/api/links', ['GET', 'HEAD', 'POST']],
      ['PUT', '/healthz', ['GET', 'HEAD']],
      ['POST', `/api/links/${c}`, ['GET', 'HEAD', 'DELETE']],
    ] as const) {
      const r = await raw(m, p);
      expectError(r, 405, 'method_not_allowed');
      expect(allowSet(r)).toEqual(new Set(allowed));
    }
  });

  test('[R-ERR-8] HEAD mirrors GET for other queries', async () => {
    const c = enc((await fixture()).code);
    for (const p of ['/api/links?limit=7', '/api/links?offset=-5', `/api/links/${c}/stats?days=1`, `/api/links/${c}/stats?days=0`]) {
      const g = await api('GET', p);
      const h = await api('HEAD', p);
      expect([h.status, h.headers['content-type']]).toEqual([g.status, g.headers['content-type']]);
      expect((await rawSocket('HEAD', p)).afterHeaders.length).toBe(0);
    }
  });
});

describe('holdout: routes and redirects', () => {
  test('[R-REDIR-3] other unknown codes -> 404 text/plain', async () => {
    for (const c of ['-', '__', 'x'.repeat(33)]) expectPlain404(await api('GET', `/${c}`));
  });

  test('[R-REDIR-9] PURGE and PUT on /{code} -> 405 text/plain, Allow {GET, HEAD}', async () => {
    const c = enc((await fixture()).code);
    for (const m of ['PURGE', 'PUT']) {
      const r = await raw(m, `/${c}`);
      expect(r.status).toBe(405);
      expect(mediaType(r)).toBe('text/plain');
      expect(allowSet(r)).toEqual(new Set(['GET', 'HEAD']));
    }
  });

  test('[R-ROUTE-1][R-ROUTE-2][R-ROUTE-3] other unmatched shapes', async () => {
    const g = await createOk({ url: u('rt') });
    expectPlain404(await raw('POST', `/${g.code}/`));
    expectPlain404(await raw('GET', `/${g.code}//`));
    for (const p of ['/api/links/.', '/api/links/..', '/api/links/%', `/api/links/${g.code}/./stats`, '/api/../healthz']) expectError(await raw('GET', p), 404, 'not_found');
    for (const p of ['/./api/links', '/LOGIN', '/Assets', '/static/', '/logout/']) expectPlain404(await raw('GET', p));
  });
});

describe('holdout: list, read, delete', () => {
  test('[R-LIST-1] four links created in sequence are listed newest first', async () => {
    const made = [];
    for (let i = 0; i < 4; i++) made.push(await createOk({ url: u('lo') }));
    const { order } = await findInList(made.map((l) => l.code));
    expect(order).toEqual(made.map((l) => l.code).reverse());
  });

  test('[R-LIST-2] offset far past the end -> items []', async () => {
    const r = await api('GET', '/api/links?offset=4611686018427387904&limit=3');
    expect(r.status).toBe(200);
    expect(r.json.items).toEqual([]);
    expect(r.json.limit).toBe(3);
  });

  test('[R-DEL-1][R-DEL-2] delete a generated link, everything 404s, then the code is reusable as an alias', async () => {
    const l = await createOk({ url: u('dl') });
    await follow(l.code);
    expect((await del(l.code)).status).toBe(204);
    expectError(await getLink(l.code), 404, 'not_found');
    expectError(await getStats(l.code, '?days=7'), 404, 'not_found');
    expectError(await del(l.code), 404, 'not_found');
    expectPlain404(await api('HEAD', `/${l.code}`));
    const again = await createOk({ url: u('dl2'), alias: l.code });
    expect([again.clickCount, again.isCustom]).toEqual([0, true]);
  });
});
