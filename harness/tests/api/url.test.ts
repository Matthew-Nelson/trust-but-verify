import { describe, expect, test } from 'vitest';
import { PUBLIC_HOSTNAME } from '../../lib/config.ts';
import { create, createOk, follow, uid, whatwg } from '../../lib/links.ts';
import { expectError, expectNewLink } from '../../lib/assert.ts';

const cp = (s: string) => [...s].length;

/** A URL of exactly n code points built from `prefix` and repeated `fill`. */
function urlOfLength(n: number, prefix: string, fill = 'a'): string {
  let s = prefix;
  while (cp(s) < n) s += fill;
  if (cp(s) !== n) throw new Error('bad fill');
  return s;
}

describe('URL validation', () => {
  test('[R-URL-1] leading/trailing ASCII whitespace (TAB LF FF CR SP) is trimmed', async () => {
    const core = `https://example.com/u1/${uid()}`;
    const r = await create({ url: `\t\n\f\r ${core} \r\f\n\t` });
    expect(r.status, r.text).toBe(201);
    expect(r.json.url).toBe(core);
  });

  test('[R-URL-1] internal TAB/LF/CR are removed by the parser, not rejected', async () => {
    const id = uid();
    const r = await create({ url: `https://exa\tmple.com/a\nb\rc/${id}` });
    expect(r.status, r.text).toBe(201);
    expect(r.json.url).toBe(`https://example.com/abc/${id}`);
  });

  test('[R-URL-1][R-URL-2] a leading non-ASCII space (U+00A0, U+2003) is not trimmed -> 422 invalid_url', async () => {
    for (const ws of [' ', ' ']) {
      const u = `${ws}https://example.com/${uid()}`;
      expectError(await create({ url: u }), 422, 'invalid_url', [u.trim()]);
    }
  });

  test('[R-URL-1][R-URL-5] a trailing U+00A0 is not trimmed; the parser percent-encodes it', async () => {
    const id = uid();
    const r = await create({ url: `https://example.com/${id} ` });
    expect(r.status, r.text).toBe(201);
    expect(r.json.url).toBe(`https://example.com/${id}%C2%A0`);
  });

  const invalid: [string, string][] = [
    ['empty string', ''],
    ['whitespace only', ' \t\n\r\f '],
    ['javascript scheme', 'javascript:alert(1)'],
    ['ftp scheme', 'ftp://example.com/'],
    ['relative path', '/relative'],
    ['no scheme', 'example.com'],
    ['http with empty host', 'http://'],
    ['https with only slashes', 'https:////'],
    ['mailto', 'mailto:someone@example.com'],
    ['file scheme (empty host)', 'file:///etc/passwd'],
    ['data scheme', 'data:text/plain,hi'],
    ['ws scheme', 'ws://example.com/'],
    ['space in host', 'http://exa mple.com/'],
    ['unclosed IPv6', 'http://[::1/'],
    ['port only', 'http://:80/'],
    ['bad port', 'http://example.com:99999/'],
    ['invalid IPv4 (part > 255)', 'http://999.1.1.1/'],
    ['forbidden host code point', 'http://exa<mple.com/'],
  ];
  test.each(invalid)('[R-URL-2] %s -> 422 invalid_url', async (_label, u) => {
    const r = await create({ url: u });
    expectError(r, 422, 'invalid_url');
  });

  test.each([
    ['upper-case scheme and host', 'HTTP://EXAMPLE.COM/Path'],
    ['IPv4 host', 'http://192.168.0.1/p'],
    ['IPv6 host', 'http://[::1]:9000/p'],
    ['userinfo', 'https://user:pass@example.com/p'],
    ['explicit non-default port', 'https://example.com:8443/p'],
    ['query and fragment', 'https://example.com/p?q=a b&x=%zz#frag ment'],
  ])('[R-URL-2][R-URL-5] valid http(s) URL (%s) -> 201 with the WHATWG serialization', async (_label, base) => {
    const u = `${base}/${uid()}`.replace('/p/', '/p-');
    const r = await create({ url: u });
    expect(r.status, r.text).toBe(201);
    expectNewLink(r.json, { url: whatwg(u) });
  });

  test('[R-URL-3] exactly 2048 code points -> 201; 2049 -> 422 invalid_url', async () => {
    const prefix = `https://example.com/u3/${uid()}/`;
    const ok = urlOfLength(2048, prefix);
    const r1 = await create({ url: ok });
    expect(r1.status, r1.text.slice(0, 200)).toBe(201);
    expect(r1.json.url).toBe(whatwg(ok));
    const bad = urlOfLength(2049, prefix);
    expectError(await create({ url: bad }), 422, 'invalid_url', [bad]);
  });

  test('[R-URL-3] length counts code points, not bytes or UTF-16 units; the normalized form may be longer', async () => {
    const prefix = `https://example.com/u3e/${uid()}/`;
    const ok = urlOfLength(2048, prefix, '\u{1F600}'); // 1 code point, 2 UTF-16 units, 4 UTF-8 bytes
    const r = await create({ url: ok });
    expect(r.status, r.text.slice(0, 200)).toBe(201);
    expect(r.json.url).toBe(whatwg(ok));
    expect(r.json.url.length).toBeGreaterThan(2048);
    const bad = urlOfLength(2049, prefix, '\u{1F600}');
    expectError(await create({ url: bad }), 422, 'invalid_url');
  });

  test('[R-URL-3][R-URL-1] length is measured after trimming: 2048 code points plus surrounding whitespace -> 201', async () => {
    const ok = urlOfLength(2048, `https://example.com/u3t/${uid()}/`);
    const r = await create({ url: `   \t${ok}\n  ` });
    expect(r.status, r.text.slice(0, 200)).toBe(201);
    expect(r.json.url).toBe(whatwg(ok));
  });

  test('[R-URL-3] length is measured before parsing: 2049 code points that include internal tabs -> 422', async () => {
    const prefix = `https://example.com/u3p/${uid()}/\t\t\t`;
    const bad = urlOfLength(2049, prefix);
    expectError(await create({ url: bad }), 422, 'invalid_url');
  });

  test('[R-URL-4] a URL whose hostname equals PUBLIC_BASE_URL\'s hostname -> 422, ignoring port, scheme, case and userinfo', async () => {
    const h = PUBLIC_HOSTNAME;
    const cases = [
      `http://${h}/${uid()}`,
      `https://${h.toUpperCase()}:9999/${uid()}`,
      `http://user:pw@${h}:1/${uid()}`,
      `  HTTP://${h}  `,
    ];
    for (const u of cases) expectError(await create({ url: u }), 422, 'invalid_url', u.includes('/', 8) ? [u.trim()] : []);
  });

  test('[R-URL-4] no DNS/IP equivalence: other hosts, subdomains and loopback IPs are accepted', async () => {
    const h = PUBLIC_HOSTNAME;
    const cases = [`http://sub.${h}/${uid()}`, `http://${h}.example/${uid()}`, `http://[::1]/${uid()}`];
    if (h !== '127.0.0.1') cases.push(`http://127.0.0.1:8080/${uid()}`);
    for (const u of cases) {
      const r = await create({ url: u });
      expect(r.status, `${u}: ${r.text}`).toBe(201);
      expect(r.json.url).toBe(whatwg(u));
    }
  });

  const normative: [string, string][] = [
    ['https://example.com', 'https://example.com/'],
    ['HTTPS://Example.COM:443/a/../b', 'https://example.com/b'],
    ['https://bücher.example/ä', 'https://xn--bcher-kva.example/%C3%A4'],
    ['https://example.com/a b', 'https://example.com/a%20b'],
    ['http:example.com', 'http://example.com/'],
    ['http:///example.com', 'http://example.com/'],
    ['https://example.com\\path', 'https://example.com/path'],
    ['  https://example.com/x  ', 'https://example.com/x'],
  ];
  test.each(normative)('[R-URL-5][R-REDIR-1] %j is stored, returned and redirected as %j', async (input, expected) => {
    const l = await createOk({ url: input });
    expect(l.url).toBe(expected);
    const g = await follow(l.code);
    expect(g.status).toBe(302);
    expect(g.headers['location']).toBe(expected);
  });

  test.each(['javascript:alert(1)', 'ftp://example.com/', '/relative', 'example.com'])(
    '[R-URL-5][R-URL-2] normative rejection %j -> 422 invalid_url',
    async (input) => {
      expectError(await create({ url: input }), 422, 'invalid_url');
    },
  );
});
