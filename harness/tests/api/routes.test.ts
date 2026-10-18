import { describe, expect, test } from 'vitest';
import { api, raw, allowSet, mediaType } from '../../lib/http.ts';
import { alias, createOk, enc, getLinkOk, lazy, uid, uurl } from '../../lib/links.ts';
import { expectError, expectPlain404 } from '../../lib/assert.ts';

const getLink = lazy(() => createOk({ url: uurl('rt'), alias: alias('rt') }));

describe('unknown codes on /{code}', () => {
  test('[R-REDIR-3] unknown code -> 404 text/plain with a non-empty body and no Location', async () => {
    expectPlain404(await api('GET', `/nope-${uid()}`));
  });

  test.each([
    ['single char', 'a'],
    ['64 chars', 'z'.repeat(64)],
    ['non-ASCII (encoded)', enc('✓ok')],
    ['encoded space', 'a%20b'],
    ['case variant of an existing alias', '{UPPER}'],
  ])('[R-REDIR-3][R-ALIAS-4] %s -> 404 text/plain', async (_l, p) => {
    const path = '/' + p.replace('{UPPER}', enc((await getLink()).code.toUpperCase()));
    expectPlain404(await api('GET', path));
  });

  test('[R-REDIR-3] /api and /api/ are handled as /{code} and /{code}/ -> 404 text/plain', async () => {
    expectPlain404(await raw('GET', '/api'));
    expectPlain404(await raw('GET', '/api/'));
  });
});

describe('R-REDIR-9 methods on /{code}', () => {
  test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('[R-REDIR-9] %s /{code} -> 405 text/plain with Allow {GET, HEAD}, for known and unknown codes', async (m) => {
    for (const code of [(await getLink()).code, `nope-${uid()}`]) {
      const r = await raw(m, `/${enc(code)}`);
      expect(r.status, `${m} /${code}`).toBe(405);
      expect(mediaType(r)).toBe('text/plain');
      expect(allowSet(r)).toEqual(new Set(['GET', 'HEAD']));
      expect(r.headers['location']).toBeUndefined();
    }
  });

  test('[R-REDIR-9] DELETE /{code} -> 405 and the link still exists', async () => {
    const l = await createOk({ url: uurl('r9'), alias: alias('r9') });
    const r = await raw('DELETE', `/${enc(l.code)}`);
    expect(r.status).toBe(405);
    expect(mediaType(r)).toBe('text/plain');
    expect(allowSet(r)).toEqual(new Set(['GET', 'HEAD']));
    const g = await getLinkOk(l.code);
    expect(g.code).toBe(l.code);
    expect(g.url).toBe(l.url);
    expect((await api('GET', `/${enc(l.code)}`)).headers['location']).toBe(l.url);
  });
});

describe('R-ROUTE-1 trailing slashes', () => {
  test('[R-ROUTE-1] /{code}/ for an existing code -> 404 text/plain (not a redirect)', async () => {
    expectPlain404(await raw('GET', `/${enc((await getLink()).code)}/`));
    expectPlain404(await raw('HEAD', `/${enc((await getLink()).code)}/`));
  });

  test('[R-ROUTE-1] /api/links/ and /api/links/{code}/ and /stats/ -> 404 not_found', async () => {
    expectError(await raw('GET', '/api/links/'), 404, 'not_found');
    expectError(await raw('GET', `/api/links/${enc((await getLink()).code)}/`), 404, 'not_found');
    expectError(await raw('GET', `/api/links/${enc((await getLink()).code)}/stats/`), 404, 'not_found');
    expectError(await raw('POST', '/api/links/', { body: JSON.stringify({ url: uurl('x') }) }), 404, 'not_found');
  });

  test('[R-ROUTE-1] /healthz/ is a different path -> 404 text/plain', async () => {
    expectPlain404(await raw('GET', '/healthz/'));
  });
});

describe('R-ROUTE-2 no path normalization', () => {
  test.each([
    '/api/links/../links',
    '/api/./links',
    '/api//links',
    '/api/links//{code}',
    '/api/links/./{code}',
    '/api/links/{code}/../{code}',
    '/api/links/%zz',
    '/api/links/%E',
    '/api/links/{code}/stats/..',
  ])('[R-ROUTE-2] %s -> 404 not_found, never a redirect', async (p) => {
    const r = await raw('GET', p.replaceAll('{code}', enc((await getLink()).code)));
    expectError(r, 404, 'not_found');
    expect(r.headers['location']).toBeUndefined();
  });

  test.each(['/./{code}', '//{code}', '/{code}/..', '/{code}/.', '/x/../{code}', '/%zz', '/abc%', '/healthz/../healthz'])(
    '[R-ROUTE-2] %s -> 404 text/plain, never a redirect',
    async (p) => {
      const r = await raw('GET', p.replaceAll('{code}', enc((await getLink()).code)));
      expectPlain404(r);
    },
  );
});

describe('R-ROUTE-3 nothing at / or reserved paths', () => {
  test.each(['/', '/docs', '/admin', '/static', '/assets', '/login', '/logout', '/ADMIN', '/Docs', '/favicon.ico', '/robots.txt', '/openapi.json', '/static/app.js', '/docs/'])(
    '[R-ROUTE-3] GET %s -> 404 text/plain',
    async (p) => {
      expectPlain404(await raw('GET', p));
    },
  );

  test('[R-ROUTE-3][R-REDIR-7] HEAD / -> 404 text/plain', async () => {
    const r = await raw('HEAD', '/');
    expect(r.status).toBe(404);
    expect(mediaType(r)).toBe('text/plain');
  });
});

describe('R-ROUTE-2 encoded dot segments (spec-v1.1)', () => {
  const never = [200, 302, 405];

  test.each([
    '/api/links/%2e',
    '/api/links/%2E%2E',
    '/api/links/.%2E',
    '/api/links/%2e.',
    '/api/%2e/links',
    '/api/%2E%2E/healthz',
    '/api/links/%2e%2e/links',
    '/api/links/{code}/%2e',
    '/api/links/{code}/%2e%2e/{code}',
    '/api/links/{code}/stats/.%2e',
    '/api/links/%2e%2e/%2e%2e/healthz',
  ])('[R-ROUTE-2] GET %s -> 404 not_found (never 200/302/405)', async (p) => {
    const r = await raw('GET', p.replaceAll('{code}', enc((await getLink()).code)));
    expect(never).not.toContain(r.status);
    expectError(r, 404, 'not_found');
    expect(r.headers['location']).toBeUndefined();
  });

  test.each(['/%2e', '/%2E%2E', '/.%2e', '/%2e/{code}', '/x/%2E%2E/{code}', '/{code}/%2e', '/y/.%2E/{code}', '/%2e%2e/{code}'])(
    '[R-ROUTE-2] GET %s -> 404 text/plain (never 200/302/405)',
    async (p) => {
      const r = await raw('GET', p.replaceAll('{code}', enc((await getLink()).code)));
      expect(never).not.toContain(r.status);
      expectPlain404(r);
    },
  );

  test('[R-ROUTE-2][R-ERR-6] encoded dot-segment paths are unmatched for every method: PUT /api/links/%2e%2e -> 404 not_found', async () => {
    const code = enc((await getLink()).code);
    for (const [m, p] of [
      ['PUT', '/api/links/%2e%2e'],
      ['POST', '/api/links/%2e'],
      ['DELETE', `/api/links/%2E%2E/links/${code}`],
      ['PATCH', `/api/links/${code}/%2e`],
      ['HEAD', '/api/links/.%2E'],
      ['OPTIONS', '/api/%2e%2e/healthz'],
    ]) {
      const r = await raw(m, p);
      expect(never, `${m} ${p}`).not.toContain(r.status);
      expect(r.status, `${m} ${p}`).toBe(404);
      expect(mediaType(r), `${m} ${p}`).toBe('application/json');
      if (m !== 'HEAD') expect(r.json?.error?.code).toBe('not_found');
    }
    for (const m of ['POST', 'DELETE', 'PUT']) {
      const r = await raw(m, `/x/%2E%2E/${code}`);
      expect(never, `${m} /x/%2E%2E/{code}`).not.toContain(r.status);
      expectPlain404(r);
    }
  });

  test('[R-ROUTE-2] decode-then-normalize would land on a real link, but the path is still unmatched: 404 and nothing deleted', async () => {
    const l = await createOk({ url: uurl('dots'), alias: alias('dots') });
    const c = enc(l.code);
    const viaApi = await raw('GET', `/api/x/%2e%2e/links/${c}`);
    expectError(viaApi, 404, 'not_found');
    expectError(await raw('GET', `/api/links/x/%2E%2E/${c}/stats`), 404, 'not_found');
    expectError(await raw('DELETE', `/api/x/%2e%2e/links/${c}`), 404, 'not_found');
    const viaRoot = await raw('GET', `/x/%2E%2E/${c}`);
    expectPlain404(viaRoot);
    expect(viaRoot.headers['location']).toBeUndefined();
    expectPlain404(await raw('GET', `/%2e/${c}`));
    const g = await getLinkOk(l.code);
    expect(g.url).toBe(l.url);
  });
});

describe('R-ROUTE-2 matching on the undecoded path (spec-v1.2)', () => {
  test('[R-ROUTE-2][R-REDIR-9][R-REDIR-3] /a%2Fb is a /{code} path: GET/HEAD 404 text/plain, PUT/DELETE 405 with Allow {GET, HEAD}', async () => {
    const p = `/a${uid(6)}%2Fb`;
    expectPlain404(await raw('GET', p));
    const head = await raw('HEAD', p);
    expect(head.status).toBe(404);
    expect(mediaType(head)).toBe('text/plain');
    for (const m of ['PUT', 'DELETE']) {
      const r = await raw(m, p);
      expect(r.status, `${m} ${p}`).toBe(405);
      expect(mediaType(r)).toBe('text/plain');
      expect(allowSet(r)).toEqual(new Set(['GET', 'HEAD']));
    }
  });

  test('[R-ROUTE-2][R-ERR-6][R-ERR-5] %2F inside /api/links/{code} does not split the segment: matched routes give 405/404, not an unmatched 404 for every method', async () => {
    const c = `x${uid(6)}%2Fy`;
    const put = await raw('PUT', `/api/links/${c}`);
    expectError(put, 405, 'method_not_allowed');
    expect(allowSet(put)).toEqual(new Set(['GET', 'HEAD', 'DELETE']));
    const post = await raw('POST', `/api/links/${c}/stats`);
    expectError(post, 405, 'method_not_allowed');
    expect(allowSet(post)).toEqual(new Set(['GET', 'HEAD']));
    expectError(await raw('GET', `/api/links/${c}`), 404, 'not_found');
    expectError(await raw('GET', `/api/links/${c}/stats`), 404, 'not_found');
  });
});

