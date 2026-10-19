// Holdout: same requirements as the public create/url/alias tests, different inputs.
import { randomInt } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { PUBLIC_BASE_URL, PUBLIC_HOSTNAME } from '../../harness/lib/config.ts';
import { create, createOk, follow, getLink, getLinkOk, uid, whatwg } from '../../harness/lib/links.ts';
import { expectError, expectGenerated, expectNewLink, expectSameLink } from '../../harness/lib/assert.ts';

const u = (tag: string) => `http://example.net/${tag}-${uid(9)}`;
const cp = (s: string) => [...s].length;
const pad = (n: number, prefix: string, fill: string) => {
  let s = prefix;
  while (cp(s) < n) s += fill;
  return s;
};

describe('holdout: create', () => {
  test('[R-LINK-1] no alias, url with query and fragment -> 7-char code, isCustom false', async () => {
    const url = `${u('h1')}?x=1#top`;
    const r = await create({ url });
    expect(r.status).toBe(201);
    expectNewLink(r.json, { url, isCustom: false });
    expectGenerated(r.json);
  });

  test('[R-LINK-2][R-LINK-4] digits/underscore/hyphen alias kept exactly; shortUrl = base + "/" + alias', async () => {
    const a = `9_Z-${uid(7)}_`;
    const l = await createOk({ url: u('h2'), alias: a });
    expectNewLink(l, { code: a, isCustom: true, shortUrl: `${PUBLIC_BASE_URL}/${a}` });
  });

  test.each([
    ['single space', ' '],
    ['tab', '\t'],
    ['newline-wrapped', `\n${uid(6)}\n`],
  ])('[R-LINK-3][R-ALIAS-1] alias %s is not trimmed -> 422 invalid_alias', async (_l, a) => {
    expectError(await create({ url: u('h3'), alias: a }), 422, 'invalid_alias');
  });

  test('[R-LINK-3] alias "" with an unknown field still means no alias', async () => {
    const url = u('h3e');
    const r = await create({ alias: '', url, note: 'x' });
    expect(r.status).toBe(201);
    expectNewLink(r.json, { url, isCustom: false });
    expectGenerated(r.json);
  });

  test('[R-LINK-5][R-GET-1] a new custom link reads back with no clicks', async () => {
    const l = await createOk({ url: u('h5'), alias: `fresh-${uid(6)}` });
    const g = await getLinkOk(l.code);
    expectSameLink(g, l);
    expect([g.clickCount, g.lastClickedAt]).toEqual([0, null]);
  });

  test('[R-LINK-7] 15 parallel creates of one http URL with alias null never 409', async () => {
    const url = u('h7');
    const rs = await Promise.all(Array.from({ length: 15 }, () => create({ url, alias: null })));
    expect(rs.map((r) => r.status)).toEqual(Array(15).fill(201));
    expect(new Set(rs.map((r) => r.json.code)).size).toBe(15);
  });

  test('[R-LINK-8] unknown fields of various types are ignored', async () => {
    const url = u('h8');
    const r = await create({ url, alias: null, expiresAt: '2030-01-01', tags: ['a'], owner: { id: 1 }, isCustom: 'yes' });
    expect(r.status).toBe(201);
    expectNewLink(r.json, { url, isCustom: false });
  });
});

describe('holdout: URL validation', () => {
  test('[R-URL-1] CR/LF/space around the URL are trimmed; LF inside the host is removed', async () => {
    const id = uid();
    const r = await create({ url: `\r\n https://exam\nple.net/${id}\t` });
    expect(r.status).toBe(201);
    expect(r.json.url).toBe(`https://example.net/${id}`);
  });

  test('[R-URL-1][R-URL-2] a leading ideographic space (U+3000) is not trimmed -> 422', async () => {
    expectError(await create({ url: `　https://example.net/${uid()}` }), 422, 'invalid_url');
  });

  test('[R-URL-2] other invalid inputs -> 422 invalid_url', async () => {
    for (const url of ['https:', 'http:/', 'gopher://example.com/', 'HTTP//example.com', 'about:blank', 'blob:https://example.com/x', 'http://exa^mple.com/', 'http://[::g]/', '\t\n']) {
      const r = await create({ url });
      expect.soft([r.status, r.json?.error?.code], JSON.stringify(url)).toEqual([422, 'invalid_url']);
    }
  });

  test('[R-URL-5][R-REDIR-1] other inputs are stored and redirected as their WHATWG serialization', async () => {
    for (const [input, want] of [
      ['http://example.com:80/x', 'http://example.com/x'],
      ['https://ex.com/a/./b/../c', 'https://ex.com/a/c'],
      ['https://example.com/?', 'https://example.com/?'],
      ['HTTPS://WWW.Example.COM/A?B#C', 'https://www.example.com/A?B#C'],
      ['http://example.com:80', 'http://example.com/'],
      ['https://münchen.example/ü', 'https://xn--mnchen-3ya.example/%C3%BC'],
      ['https://example.com/a/../../b', 'https://example.com/b'],
      ['https:example.org', 'https://example.org/'],
    ]) {
      const r = await create({ url: input });
      expect.soft(r.json?.url, input).toBe(want);
      if (r.status === 201) expect.soft((await follow(r.json.code)).headers['location'], input).toBe(want);
    }
  });

  test('[R-URL-3] 2047 and 2048 code points of two-byte characters are accepted; 2049 and 2050 are not', async () => {
    const prefix = `https://example.net/len/${uid()}/`;
    for (const n of [2047, 2048]) {
      const url = pad(n, prefix, 'é');
      const r = await create({ url });
      expect(r.status, `${n}`).toBe(201);
      expect(r.json.url).toBe(whatwg(url));
    }
    for (const n of [2049, 2050]) expectError(await create({ url: pad(n, prefix, 'é') }), 422, 'invalid_url');
  });

  test('[R-URL-3][R-URL-1] 2048 code points wrapped in CR/LF are accepted (trim before measuring)', async () => {
    const url = pad(2048, `https://example.net/len2/${uid()}/`, 'z');
    const r = await create({ url: `\r\n${url}\r\n` });
    expect(r.status).toBe(201);
    expect(r.json.url).toBe(whatwg(url));
  });

  test('[R-URL-4] the api hostname in other spellings -> 422; a trailing-dot host is a different hostname', async () => {
    const h = PUBLIC_HOSTNAME;
    const mixed = [...h].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('');
    for (const url of [`https://${h}:443/${uid()}`, `http://${mixed}:3000/${uid()}`]) expectError(await create({ url }), 422, 'invalid_url');
    const ok = await create({ url: `http://${h}./${uid()}` });
    expect(ok.status, ok.text).toBe(201);
  });
});

describe('holdout: C0 controls at the ends', () => {
  test('[R-URL-1][R-URL-5][R-URL-3] leading U+0001 and trailing U+001F are removed by the parser but count toward 2048', async () => {
    const id = uid();
    const r = await create({ url: `\u0001https://example.net/c0/${id}\u001F` });
    expect(r.status).toBe(201);
    expect(r.json.url).toBe(`https://example.net/c0/${id}`);
    expect((await follow(r.json.code)).headers['location']).toBe(`https://example.net/c0/${id}`);
    const body = pad(2047, `\u0001https://example.net/c0l/${uid()}/`, 'k');
    const ok = await create({ url: body + '\u001F' });
    expect(ok.status).toBe(201);
    expect(ok.json.url).toBe(whatwg(body.slice(1)));
    expectError(await create({ url: body + 'k\u001F' }), 422, 'invalid_url');
  });
});

describe('holdout: aliases', () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const rnd = (n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join('');

  test('[R-ALIAS-1] lengths 31 and 32 accepted; 33 and 40 rejected; 2 rejected', async () => {
    for (const n of [31, 32]) {
      const a = `L${n}_${uid(n - 4)}`;
      expect(cp(a)).toBe(n);
      expect((await create({ url: u('a1'), alias: a })).status).toBe(201);
    }
    for (const n of [33, 40]) expectError(await create({ url: u('a1'), alias: `M${n}_${uid(n - 4)}` }), 422, 'invalid_alias');
    expectError(await create({ url: u('a1'), alias: rnd(2) }), 422, 'invalid_alias');
  });

  test('[R-ALIAS-1] a random 3-character alias is accepted', async () => {
    for (let i = 0; i < 25; i++) {
      const a = rnd(3);
      if (['api'].includes(a.toLowerCase())) continue;
      const r = await create({ url: u('a3'), alias: a });
      if (r.status === 409) continue;
      expect(r.status).toBe(201);
      expect(r.json.code).toBe(a);
      return;
    }
    throw new Error('no free 3-char alias');
  });

  test.each(['#', '?', '&', '=', '*', '\r', 'ß', '\t', '​'])('[R-ALIAS-1] alias containing %j -> 422 invalid_alias', async (c) => {
    expectError(await create({ url: u('a1b'), alias: `ok${uid(4)}${c}x` }), 422, 'invalid_alias');
  });

  test('[R-ALIAS-2] reserved words in other letter cases -> 422 alias_reserved', async () => {
    for (const a of ['Api', 'HEALTHZ', 'dOcS', 'ADMIN', 'sTATIC', 'Assets', 'LOGIN', 'LOGOUT', 'hEaLtHz']) {
      const r = await create({ url: u('a2'), alias: a });
      expect.soft([r.status, r.json?.error?.code], a).toEqual([422, 'alias_reserved']);
    }
  });

  test('[R-ALIAS-2] near misses are not reserved', async () => {
    for (const a of [`logout_${uid(3)}`, `${uid(3)}static`, `healthzz${uid(2)}`]) {
      const r = await create({ url: u('a2n'), alias: a });
      expect([r.status, r.json?.code]).toEqual([201, a]);
    }
  });

  test('[R-ALIAS-3] reusing a live alias -> 409 alias_taken and the original survives', async () => {
    const a = `Taken_${uid(6)}`;
    const first = await createOk({ url: u('a3t'), alias: a });
    expectError(await create({ url: u('a3t2'), alias: a }), 409, 'alias_taken', [a]);
    expect((await getLinkOk(a)).url).toBe(first.url);
  });

  test('[R-ALIAS-4] three case variants are three links', async () => {
    const id = uid(6);
    const variants = [`Promo-${id}`, `PROMO-${id}`, `promo-${id}`];
    const urls = variants.map(() => u('a4'));
    for (let i = 0; i < 3; i++) await createOk({ url: urls[i], alias: variants[i] });
    for (let i = 0; i < 3; i++) expect((await getLinkOk(variants[i])).url).toBe(urls[i]);
    expect((await getLink(`pRoMo-${id}`)).status).toBe(404);
  });
});
