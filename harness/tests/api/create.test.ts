import { describe, expect, test } from 'vitest';
import { PUBLIC_BASE_URL } from '../../lib/config.ts';
import { mediaType } from '../../lib/http.ts';
import { alias, create, createOk, getLinkOk, uid, uurl, type Link } from '../../lib/links.ts';
import { expectError, expectGenerated, expectNewLink } from '../../lib/assert.ts';

describe('POST /api/links', () => {
  test('[R-LINK-1] no alias -> 201 with a 7-char [A-Za-z0-9] code and isCustom false', async () => {
    const url = uurl('l1');
    const r = await create({ url });
    expect(r.status).toBe(201);
    expect(mediaType(r)).toBe('application/json');
    expectNewLink(r.json, { url, isCustom: false });
    expectGenerated(r.json);
  });

  test('[R-LINK-1] 25 generated codes all match ^[A-Za-z0-9]{7}$ and each resolves to its own url', async () => {
    const urls = Array.from({ length: 25 }, () => uurl('l1b'));
    const links = await Promise.all(urls.map((url) => createOk({ url })));
    for (const l of links) expectGenerated(l);
    for (let i = 0; i < links.length; i++) expect((await getLinkOk(links[i].code)).url).toBe(urls[i]);
  });

  test('[R-LINK-2] alias -> 201 with code equal to the alias exactly as sent and isCustom true', async () => {
    const a = `MiXed_Case-${uid(8)}`;
    const url = uurl('l2');
    const r = await create({ url, alias: a });
    expect(r.status).toBe(201);
    expectNewLink(r.json, { code: a, url, isCustom: true });
  });

  test.each([
    ['omitted', undefined],
    ['null', null],
    ['empty string', ''],
  ])('[R-LINK-3] alias %s is treated as no alias', async (_label, value) => {
    const url = uurl('l3');
    const body: Record<string, unknown> = { url };
    if (value !== undefined) body.alias = value;
    const r = await create(body);
    expect(r.status).toBe(201);
    expectNewLink(r.json, { url, isCustom: false });
    expectGenerated(r.json);
  });

  test.each([
    ['three spaces', '   '],
    ['leading space', ` ${alias('lsp')}`],
    ['trailing space', `${alias('tsp')} `],
    ['trailing tab', `${alias('ttab')}\t`],
    ['leading NBSP', ` ${alias('nbsp')}`],
  ])('[R-LINK-3][R-ALIAS-1] alias with whitespace (%s) is never trimmed -> 422 invalid_alias', async (_label, a) => {
    const r = await create({ url: uurl('l3w'), alias: a });
    expectError(r, 422, 'invalid_alias', [a.trim()]);
  });

  test('[R-LINK-4] shortUrl is PUBLIC_BASE_URL + "/" + code, for generated and custom codes', async () => {
    const g = await createOk({ url: uurl('l4') });
    const a = alias('l4');
    const c = await createOk({ url: uurl('l4'), alias: a });
    expect(g.shortUrl).toBe(`${PUBLIC_BASE_URL}/${g.code}`);
    expect(c.shortUrl).toBe(`${PUBLIC_BASE_URL}/${a}`);
    expect(new URL(c.shortUrl).pathname).toBe(`/${a}`);
  });

  test('[R-LINK-5] a new link has clickCount 0 and lastClickedAt null, on create and on GET', async () => {
    const l = await createOk({ url: uurl('l5'), alias: alias('l5') });
    expect(l.clickCount).toBe(0);
    expect(l.lastClickedAt).toBeNull();
    const g = await getLinkOk(l.code);
    expect(g.clickCount).toBe(0);
    expect(g.lastClickedAt).toBeNull();
  });

  test('[R-LINK-7] requests with no alias never return 409, even for the same url sent repeatedly', async () => {
    const url = uurl('l7');
    const rs = await Promise.all(Array.from({ length: 30 }, () => create({ url })));
    for (const r of rs) expect(r.status, r.text).toBe(201);
    const codes = new Set(rs.map((r) => (r.json as Link).code));
    expect(codes.size).toBe(30);
    for (const r of rs) expect((r.json as Link).url).toBe(url);
  });

  test('[R-LINK-8] unknown body fields are ignored (including ones named like Link fields)', async () => {
    const url = uurl('l8');
    const r = await create({
      url,
      code: 'zzzzzzz',
      isCustom: true,
      clickCount: 99,
      lastClickedAt: '2020-01-01T00:00:00Z',
      shortUrl: 'https://evil.example/x',
      createdAt: '2000-01-01T00:00:00Z',
      extra: { nested: [1, 2, 3] },
    });
    expect(r.status).toBe(201);
    expectNewLink(r.json, { url, isCustom: false });
    expectGenerated(r.json);
    expect(r.json.code).not.toBe('zzzzzzz');
    expect(new Date(r.json.createdAt).getUTCFullYear()).not.toBe(2000);
  });

  test('[R-LINK-8] unknown fields next to an alias are ignored', async () => {
    const a = alias('l8b');
    const r = await create({ alias: a, url: uurl('l8b'), isCustom: false, foo: null });
    expect(r.status).toBe(201);
    expectNewLink(r.json, { code: a, isCustom: true });
  });
});
