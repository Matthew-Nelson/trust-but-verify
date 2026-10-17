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
