import { describe, expect, test } from 'vitest';
import { api, raw, rawSocket, allowSet, mediaType, type Res } from '../../lib/http.ts';
import { alias, create, createOk, enc, getStatsOk, lazy, uid, uurl } from '../../lib/links.ts';
import { expectError, expectNewLink } from '../../lib/assert.ts';

const post = (body: string | Buffer, contentType: string | null = 'application/json') =>
  raw('POST', '/api/links', { body, headers: contentType ? ['Content-Type', contentType] : [] });

function bodyOfSize(n: number, url: string): string {
  const head = `{"url":${JSON.stringify(url)},"pad":"`;
  const tail = '"}';
  const s = head + 'a'.repeat(n - Buffer.byteLength(head) - tail.length) + tail;
  if (Buffer.byteLength(s) !== n) throw new Error('size');
  return s;
}

const getExisting = lazy(() => createOk({ url: uurl('err'), alias: alias('err') }));

describe('R-ERR-1 error envelope', () => {
  test('[R-ERR-1] unknown /api/ path -> 404 JSON {"error":{"code":"not_found","message"}}', async () => {
    expectError(await api('GET', `/api/nope-${uid()}`), 404, 'not_found');
    expectError(await api('GET', `/api/links/${uid()}/nope`), 404, 'not_found');
  });

  test('[R-ERR-1] /healthz and /api/links errors are JSON envelopes (405 and 400 examples)', async () => {
    expectError(await raw('POST', '/healthz'), 405, 'method_not_allowed');
    expectError(await post('{'), 400, 'bad_request');
  });
});

describe('R-ERR-2 body parsing and precedence', () => {
  const malformed: [string, string][] = [
    ['invalid JSON', '{'],
    ['empty body', ''],
    ['trailing garbage', '{"url":"https://example.com/"} x'],
    ['trailing comma', '{"url":"https://example.com/",}'],
    ['single quotes', "{'url':'https://example.com/'}"],
    ['top-level array', '["https://example.com/"]'],
    ['top-level string', '"https://example.com/"'],
    ['top-level number', '42'],
    ['top-level null', 'null'],
    ['top-level true', 'true'],
    ['url absent', '{}'],
    ['url absent, alias present', '{"alias":"abc-def"}'],
    ['url null', '{"url":null}'],
    ['url number', '{"url":5}'],
    ['url boolean', '{"url":true}'],
    ['url array', '{"url":["https://example.com/"]}'],
    ['url object', '{"url":{"href":"https://example.com/"}}'],
    ['alias number', '{"url":"https://example.com/","alias":5}'],
    ['alias boolean', '{"url":"https://example.com/","alias":false}'],
    ['alias array', '{"url":"https://example.com/","alias":["abc"]}'],
    ['alias object', '{"url":"https://example.com/","alias":{}}'],
    ['NaN literal', '{"url":"https://example.com/","alias":NaN}'],
    ['unpaired high surrogate in url', '{"url":"https://example.com/\\ud800"}'],
    ['unpaired low surrogate in alias', '{"url":"https://example.com/","alias":"ab\\udc00c"}'],
    ['reversed surrogate pair', '{"url":"https://example.com/\\ude00\\ud83d"}'],
  ];
  test.each(malformed)('[R-ERR-2] malformed body (%s) -> 400 bad_request', async (_label, body) => {
    expectError(await post(body), 400, 'bad_request');
  });

  test('[R-ERR-2] a body that is not valid UTF-8 -> 400 bad_request', async () => {
    const body = Buffer.concat([Buffer.from('{"url":"https://example.com/'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
    expectError(await post(body), 400, 'bad_request');
    const overlong = Buffer.concat([Buffer.from('{"url":"https://example.com/'), Buffer.from([0xc0, 0xaf]), Buffer.from('"}')]);
    expectError(await post(overlong), 400, 'bad_request');
  });

  test('[R-ERR-2] a properly paired surrogate escape is valid and is percent-encoded', async () => {
    const id = uid();
    const r = await post(`{"url":"https://example.com/${id}/\\ud83d\\ude00"}`);
    expect(r.status, r.text).toBe(201);
    expect(r.json.url).toBe(`https://example.com/${id}/%F0%9F%98%80`);
  });

  test('[R-ERR-2] a 64 KiB body (65536 bytes) is accepted; 65537 bytes -> 400 bad_request', async () => {
    const url = uurl('64k');
    const ok = await post(bodyOfSize(65536, url));
    expect(ok.status, ok.text.slice(0, 200)).toBe(201);
    expect(ok.json.url).toBe(url);
    expectError(await post(bodyOfSize(65537, uurl('64k'))), 400, 'bad_request');
  });

  test('[R-ERR-2] malformed beats content errors: url not a string with a reserved alias -> 400', async () => {
    expectError(await post('{"url":7,"alias":"admin"}'), 400, 'bad_request');
    expectError(await post('{"url":"not a url","alias":7}'), 400, 'bad_request');
    expectError(await post('{"alias":"!","url":null}'), 400, 'bad_request');
  });

  test('[R-ERR-2] R-URL beats R-ALIAS-1/2/3: bad url with bad, reserved or taken alias -> 422 invalid_url', async () => {
    expectError(await create({ url: 'nope', alias: '!' }), 422, 'invalid_url');
    expectError(await create({ url: 'ftp://example.com/', alias: 'Admin' }), 422, 'invalid_url');
    expectError(await create({ url: 'https://example.com/' + 'a'.repeat(2100), alias: 'x' }), 422, 'invalid_url');
    expectError(await create({ url: '', alias: (await getExisting()).code }), 422, 'invalid_url');
  });

  test('[R-ERR-2] R-ALIAS-1 beats R-ALIAS-2: a reserved word with an invalid character -> invalid_alias', async () => {
    expectError(await create({ url: uurl('p'), alias: 'admin!' }), 422, 'invalid_alias');
    expectError(await create({ url: uurl('p'), alias: 'ap' }), 422, 'invalid_alias');
  });

  test('[R-ERR-2] content checks are never 400: empty url string, overlong url and odd aliases are 422', async () => {
    expectError(await create({ url: '' }), 422, 'invalid_url');
    expectError(await create({ url: 'https://example.com/' + 'b'.repeat(3000) }), 422, 'invalid_url');
    expectError(await create({ url: uurl('p'), alias: 'x'.repeat(500) }), 422, 'invalid_alias');
  });

  test.each([
    ['text/plain', 'text/plain'],
    ['form-urlencoded', 'application/x-www-form-urlencoded'],
    ['absent', null],
    ['nonsense', 'image/png'],
  ])('[R-ERR-2] Content-Type is ignored (%s): the body is parsed as JSON', async (_label, ct) => {
    const url = uurl('ct');
    const r = await post(JSON.stringify({ url }), ct);
    expect(r.status, r.text).toBe(201);
    expectNewLink(r.json, { url });
  });

  test('[R-ERR-2] Content-Type is ignored for malformed bodies too: application/json header with a form body -> 400', async () => {
    expectError(await post('url=https%3A%2F%2Fexample.com%2F'), 400, 'bad_request');
  });

  test('[R-ERR-2] duplicate keys: the last value wins', async () => {
    const good = uurl('dup');
    const r1 = await post(`{"url":"not a url","url":${JSON.stringify(good)}}`);
    expect(r1.status, r1.text).toBe(201);
    expect(r1.json.url).toBe(good);

    const a = alias('dup');
    const r2 = await post(`{"url":${JSON.stringify(uurl('dup'))},"alias":"!!","alias":${JSON.stringify(a)}}`);
    expect(r2.status, r2.text).toBe(201);
    expect(r2.json.code).toBe(a);

    const r3 = await post(`{"url":${JSON.stringify(uurl('dup'))},"alias":${JSON.stringify(alias('dup'))},"alias":null}`);
    expect(r3.status, r3.text).toBe(201);
    expect(r3.json.isCustom).toBe(false);
    expect(r3.json.code).toMatch(/^[A-Za-z0-9]{7}$/);

    expectError(await post(`{"url":${JSON.stringify(uurl('dup'))},"url":null}`), 400, 'bad_request');
  });

  test('[R-ERR-2] insignificant JSON whitespace around and inside the body is fine', async () => {
    const url = uurl('ws');
    const r = await post(`\n\t {\r\n "url" : ${JSON.stringify(url)} ,\n "alias" : null } \n`);
    expect(r.status, r.text).toBe(201);
    expect(r.json.url).toBe(url);
  });
});

describe('R-ERR-3 query integers', () => {
  /** Every value must give 400 bad_request; soft assertions report each failing value. */
  async function allBad(pathFor: (q: string) => Promise<string>, qs: string[]): Promise<void> {
    for (const q of qs) {
      const r = await api('GET', await pathFor(q));
      expect.soft(r.status, `?${q} -> ${r.status} ${r.text.slice(0, 120)}`).toBe(400);
      if (r.status === 400) expect.soft(r.json?.error?.code, `?${q}`).toBe('bad_request');
    }
  }
  const list = async (q: string) => `/api/links?${q}`;

  // Each group mixes range violations with "query integer" syntax violations that no schema expresses.
  test('[R-ERR-3][R-LIST-1] limit must be a query integer in 1..100, never clamped -> otherwise 400', async () => {
    await allBad(list, ['limit=0', 'limit=101', 'limit=-1', 'limit=05', 'limit=+5', 'limit=%2B5', 'limit=1.5', 'limit=1e2', 'limit=',
      'limit=abc', 'limit=%205', 'limit=0x10', 'limit=%EF%BC%92', 'limit=9223372036854775808', 'limit=100.0']);
  });

  test('[R-ERR-3][R-LIST-1] offset must be a query integer >= 0 that fits in i64 -> otherwise 400', async () => {
    await allBad(list, ['offset=-1', 'offset=01', 'offset=1.0', 'offset=', 'offset=+0', 'offset=-0', 'offset=9223372036854775808',
      'offset=99999999999999999999', 'offset=1e3', 'limit=10&offset=%2D1']);
  });

  test('[R-ERR-3] a repeated parameter is not a query integer -> 400, even when the values are equal and valid', async () => {
    await allBad(list, ['limit=5&limit=5', 'offset=0&offset=0', 'limit=5&limit=6', 'offset=1&limit=2&offset=1']);
    const code = enc((await getExisting()).code);
    await allBad(async (q) => `/api/links/${code}/stats?${q}`, ['days=7&days=7', 'days=1&days=30']);
    // The same values sent once are valid, so the 400s above are due to repetition alone.
    const once = await api('GET', '/api/links?limit=5&offset=1');
    expect(once.status).toBe(200);
    expect([once.json.limit, once.json.offset]).toEqual([5, 1]);
    expect((await getStatsOk((await getExisting()).code, '?days=1')).days).toBe(1);
  });

  test.each([
    ['limit=1', 1, 0],
    ['limit=100', 100, 0],
    ['limit=%31%30', 10, 0],
    ['offset=%31', 20, 1],
    ['limit=3&offset=2', 3, 2],
    ['foo=bar&days=abc&limit=7', 7, 0],
  ])('[R-ERR-3][R-LIST-2] GET /api/links?%s -> 200 echoing limit %i offset %i', async (q, limit, offset) => {
    const r = await api('GET', `/api/links?${q}`);
    expect(r.status, r.text).toBe(200);
    expect(r.json.limit).toBe(limit);
    expect(r.json.offset).toBe(offset);
    expect(r.json.items.length).toBeLessThanOrEqual(limit);
  });

  test('[R-ERR-3][R-LIST-2] offset = 2^63-1 is a valid query integer -> 200 with items []', async () => {
    const r = await api('GET', '/api/links?offset=9223372036854775807');
    expect(r.status, r.text).toBe(200);
    expect(r.json.items).toEqual([]);
    expect(r.json.offset).toBe(9223372036854775807);
  });

  test('[R-ERR-3][R-STATS-1] days must be a query integer in 1..365 -> otherwise 400', async () => {
    const code = enc((await getExisting()).code);
    await allBad(async (q) => `/api/links/${code}/stats?${q}`, ['days=0', 'days=366', 'days=-1', 'days=030', 'days=07', 'days=7.0', 'days=1e1',
      'days=', 'days=abc', 'days=99999999999999999999', 'days=+7', 'days=%2B7', 'days=%207']);
  });

  test('[R-ERR-3][R-ERR-5] query validation runs before code lookup: unknown code -> 400 with bad days, 404 with good days', async () => {
    const code = `nope-${uid()}`;
    expectError(await api('GET', `/api/links/${code}/stats?days=0`), 400, 'bad_request');
    expectError(await api('GET', `/api/links/${code}/stats?days=x`), 400, 'bad_request');
    expectError(await api('GET', `/api/links/${code}/stats?days=7`), 404, 'not_found');
  });

  test('[R-ERR-3] parameters are ignored where undefined: limit/offset/days on other endpoints', async () => {
    const c = enc((await getExisting()).code);
    expect((await api('GET', `/api/links/${c}?limit=abc&offset=-1&days=0`)).status).toBe(200);
    const s = await api('GET', `/api/links/${c}/stats?limit=0&offset=x`);
    expect(s.status).toBe(200);
    expect(s.json.days).toBe(30);
    expect((await api('GET', '/healthz?days=0&limit=-5')).status).toBe(200);
    const p = await api('POST', '/api/links?limit=0&offset=-1&days=0', { json: { url: uurl('q') } });
    expect(p.status, p.text).toBe(201);
    const d = await createOk({ url: uurl('q') });
    expect((await api('DELETE', `/api/links/${enc(d.code)}?days=0&limit=0`)).status).toBe(204);
    expect((await api('GET', `/${c}?days=0&limit=0`)).status).toBe(302);
  });
});

describe('R-ERR-4 safe messages', () => {
  test('[R-ERR-4] error messages never echo codes, aliases, URLs or header values', async () => {
    const probe = `probe${uid()}`;
    const hdr = { 'x-probe': probe, 'user-agent': `UA-${probe}`, referer: `https://${probe}.example/` };
    const badUrl = `ftp://${probe}.example/${probe}`;
    let r = await api('POST', '/api/links', { json: { url: badUrl }, headers: hdr });
    expectError(r, 422, 'invalid_url', [badUrl, probe]);
    const badAlias = `${probe}!`;
    r = await api('POST', '/api/links', { json: { url: uurl('e4'), alias: badAlias }, headers: hdr });
    expectError(r, 422, 'invalid_alias', [badAlias, probe]);
    r = await api('POST', '/api/links', { json: { url: uurl('e4'), alias: (await getExisting()).code }, headers: hdr });
    expectError(r, 409, 'alias_taken', [(await getExisting()).code]);
    r = await api('GET', `/api/links/${probe}`, { headers: hdr });
    expectError(r, 404, 'not_found', [probe]);
    r = await api('GET', `/api/links/${probe}/stats?days=${probe}`, { headers: hdr });
    expectError(r, 400, 'bad_request', [probe]);
    r = await api('DELETE', `/api/links/${probe}`, { headers: hdr });
    expectError(r, 404, 'not_found', [probe]);
    r = await raw('PUT', `/api/links/${probe}`, { headers: ['X-Probe', probe] });
    expectError(r, 405, 'method_not_allowed', [probe]);
    r = await post(`{"url":"${probe}`);
    expectError(r, 400, 'bad_request', [probe]);
  });

  test('[R-ERR-4] SQL-looking and path-looking inputs do not leak into messages', async () => {
    const sqlAlias = `'; SELECT * FROM links WHERE '1'='1`;
    expectError(await create({ url: uurl('e4'), alias: sqlAlias }), 422, 'invalid_alias', [sqlAlias]);
    const sqlUrl = `https://example.com/'; DELETE FROM links WHERE '1'='1`;
    const r = await create({ url: sqlUrl, alias: `/var/app/x.rs:12` });
    expectError(r, 422, 'invalid_alias');
    expectError(await api('GET', `/api/links/${enc("x' OR 1=1 --")}`), 404, 'not_found');
  });
});

describe('R-ERR-5 code lookup', () => {
  test.each([
    ['random unknown code', () => `nope${uid()}`],
    ['single char', () => 'a'],
    ['64 chars', () => 'q'.repeat(64)],
    ['non-ASCII', () => '✓✓✓'],
    ['space', () => 'a b c'],
    ['punctuation', () => '!!!'],
    ['encoded slash', () => 'a/b'],
  ])('[R-ERR-5] %s -> 404 not_found on GET, DELETE and stats', async (_l, mk) => {
    const c = enc(mk());
    expectError(await api('GET', `/api/links/${c}`), 404, 'not_found');
    expectError(await api('DELETE', `/api/links/${c}`), 404, 'not_found');
    expectError(await api('GET', `/api/links/${c}/stats`), 404, 'not_found');
  });

  test('[R-ERR-5][R-STATS-1] path segments are percent-decoded exactly once before lookup', async () => {
    const id = uid();
    const a = `pct-${id}`;
    await createOk({ url: uurl('pct'), alias: a });
    const g = await api('GET', `/api/links/pct%2D${id}`);
    expect(g.status, g.text).toBe(200);
    expect(g.json.code).toBe(a);
    const s = await api('GET', `/api/links/%70ct-${id}/stats`);
    expect(s.status, s.text).toBe(200);
    expect(s.json.code).toBe(a);
    expectError(await api('GET', `/api/links/pct%252D${id}`), 404, 'not_found');
    expect((await api('DELETE', `/api/links/pct%2d${id}`)).status).toBe(204);
    expectError(await api('GET', `/api/links/${a}`), 404, 'not_found');
  });
});

describe('R-ERR-6 check order and 405s', () => {
  test.each([
    ['POST', '/api/nope'],
    ['DELETE', '/api/links/x/stats/extra'],
    ['PUT', '/api/links/'],
    ['PATCH', '/api/links/x/'],
    ['POST', '/api/links/x/stats/'],
  ])('[R-ERR-6] unmatched path is 404 not_found regardless of method: %s %s', async (m, p) => {
    expectError(await raw(m, p), 404, 'not_found');
  });

  test('[R-ERR-6] unmatched non-/api/ paths are 404 text/plain regardless of method', async () => {
    for (const [m, p] of [['POST', `/a/${uid()}`], ['POST', `/${(await getExisting()).code}/`], ['DELETE', '/healthz/x'], ['PUT', `/${uid()}/x`]]) {
      const r = await raw(m, p);
      expect(r.status, `${m} ${p}`).toBe(404);
      expect(mediaType(r)).toBe('text/plain');
    }
  });

  const routes405: [string, string[], string[]][] = [
    ['/api/links', ['PUT', 'PATCH', 'DELETE', 'OPTIONS'], ['GET', 'HEAD', 'POST']],
    ['/api/links/{existing}', ['PUT', 'PATCH', 'POST', 'OPTIONS'], ['GET', 'HEAD', 'DELETE']],
    ['/api/links/{unknown}', ['PUT', 'PATCH', 'POST', 'OPTIONS'], ['GET', 'HEAD', 'DELETE']],
    ['/api/links/{existing}/stats', ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], ['GET', 'HEAD']],
    ['/api/links/{unknown}/stats', ['POST', 'DELETE'], ['GET', 'HEAD']],
    ['/healthz', ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], ['GET', 'HEAD']],
  ];
  test.each(routes405)('[R-ERR-6][R-ERR-8] %s: unsupported methods -> 405 method_not_allowed with Allow = supported set', async (route, methods, allowed) => {
    const path = route.replace('{existing}', enc((await getExisting()).code)).replace('{unknown}', `nope-${uid()}`);
    for (const m of methods) {
      const r = await raw(m, path);
      expectError(r, 405, 'method_not_allowed');
      expect(allowSet(r), `${m} ${path} Allow`).toEqual(new Set(allowed));
    }
  });

  test('[R-ERR-6] method is checked before query validation', async () => {
    expectError(await raw('PATCH', '/api/links?limit=abc'), 405, 'method_not_allowed');
    expectError(await raw('POST', `/api/links/${enc((await getExisting()).code)}/stats?days=0`), 405, 'method_not_allowed');
    expectError(await raw('PUT', `/api/links/nope-${uid()}/stats?days=x`), 405, 'method_not_allowed');
  });

  test('[R-ERR-6] the 405 does not depend on whether the code exists, and nothing is deleted or changed', async () => {
    const l = await createOk({ url: uurl('e6'), alias: alias('e6') });
    const r = await raw('PUT', `/api/links/${enc(l.code)}`, { body: JSON.stringify({ url: uurl('changed') }), headers: ['Content-Type', 'application/json'] });
    expectError(r, 405, 'method_not_allowed');
    const g = await api('GET', `/api/links/${enc(l.code)}`);
    expect(g.json.url).toBe(l.url);
  });
});

describe('R-ERR-8 HEAD and OPTIONS', () => {
  async function headMatchesGet(path: string): Promise<{ get: Res; head: Res }> {
    const get = await api('GET', path);
    const head = await api('HEAD', path);
    expect(head.status, `HEAD ${path}`).toBe(get.status);
    expect(head.headers['content-type'], `HEAD ${path} Content-Type`).toBe(get.headers['content-type']);
    const sock = await rawSocket('HEAD', path);
    expect(sock.status).toBe(get.status);
    expect(sock.afterHeaders.length, `HEAD ${path} sent body bytes`).toBe(0);
    return { get, head };
  }

  test('[R-ERR-8] HEAD /healthz -> same status and Content-Type as GET, no body', async () => {
    const { get } = await headMatchesGet('/healthz');
    expect(get.status).toBe(200);
  });

  test('[R-ERR-8] HEAD /api/links (default and with a bad limit) mirrors GET', async () => {
    expect((await headMatchesGet('/api/links')).get.status).toBe(200);
    expect((await headMatchesGet('/api/links?limit=0')).get.status).toBe(400);
  });

  test('[R-ERR-8] HEAD /api/links/{code} mirrors GET for known and unknown codes', async () => {
    expect((await headMatchesGet(`/api/links/${enc((await getExisting()).code)}`)).get.status).toBe(200);
    expect((await headMatchesGet(`/api/links/nope-${uid()}`)).get.status).toBe(404);
  });

  test('[R-ERR-8] HEAD /api/links/{code}/stats mirrors GET (200, 400, 404)', async () => {
    expect((await headMatchesGet(`/api/links/${enc((await getExisting()).code)}/stats?days=7`)).get.status).toBe(200);
    expect((await headMatchesGet(`/api/links/${enc((await getExisting()).code)}/stats?days=366`)).get.status).toBe(400);
    expect((await headMatchesGet(`/api/links/nope-${uid()}/stats`)).get.status).toBe(404);
  });

  test('[R-ERR-8][R-REDIR-9] OPTIONS is unsupported everywhere -> 405', async () => {
    for (const p of ['/healthz', '/api/links', `/api/links/${enc((await getExisting()).code)}`, `/api/links/${enc((await getExisting()).code)}/stats`]) {
      const r = await raw('OPTIONS', p);
      expectError(r, 405, 'method_not_allowed');
      expect(allowSet(r)!.has('HEAD'), `${p} Allow includes HEAD`).toBe(true);
    }
    const r = await raw('OPTIONS', `/${enc((await getExisting()).code)}`);
    expect(r.status).toBe(405);
    expect(mediaType(r)).toBe('text/plain');
    expect(allowSet(r)).toEqual(new Set(['GET', 'HEAD']));
  });
});
