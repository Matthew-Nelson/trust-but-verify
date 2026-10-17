import { randomInt } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { alias, create, createOk, follow, getLink, getLinkOk, uid, uurl, RESERVED } from '../../lib/links.ts';
import { expectError, expectNewLink } from '../../lib/assert.ts';

const ALIAS_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const randAlias = (n: number) => Array.from({ length: n }, () => ALIAS_CHARS[randomInt(ALIAS_CHARS.length)]).join('');

/**
 * Create with a random alias of length n. Short aliases can collide with ones left by earlier
 * runs, so a 409 (which proves the alias passed R-ALIAS-1/2) leads to a retry with a fresh one.
 */
async function createWithRandomAlias(n: number) {
  for (let i = 0; i < 25; i++) {
    const a = randAlias(n);
    if (RESERVED.includes(a.toLowerCase())) continue;
    const url = uurl('a1');
    const r = await create({ url, alias: a });
    if (r.status === 409) {
      expectError(r, 409, 'alias_taken');
      continue;
    }
    return { r, a, url };
  }
  throw new Error(`could not find a free ${n}-char alias in 25 tries`);
}

describe('alias validation', () => {
  test('[R-ALIAS-1] a 3-character alias is accepted (lower bound)', async () => {
    const { r, a, url } = await createWithRandomAlias(3);
    expect(r.status, r.text).toBe(201);
    expectNewLink(r.json, { code: a, url, isCustom: true });
  });

  test('[R-ALIAS-1] a 2-character alias -> 422 invalid_alias', async () => {
    expectError(await create({ url: uurl('a1'), alias: randAlias(2) }), 422, 'invalid_alias');
  });

  test('[R-ALIAS-1] a 32-character alias is accepted; 33 characters -> 422 invalid_alias', async () => {
    const a32 = `b32-${uid(28)}`;
    expect(a32).toHaveLength(32);
    const r = await create({ url: uurl('a1'), alias: a32 });
    expect(r.status, r.text).toBe(201);
    expect(r.json.code).toBe(a32);
    const a33 = `c33-${uid(29)}`;
    expectError(await create({ url: uurl('a1'), alias: a33 }), 422, 'invalid_alias', [a33]);
  });

  test('[R-ALIAS-1] every allowed character class is accepted: letters, digits, "_" and "-", in any position', async () => {
    for (const a of [`aZ09_-${uid(6)}`, `-${uid(8)}`, `_${uid(8)}_`, `${uid(6)}--`, `${randomInt(1e6, 1e7)}${randomInt(10)}`]) {
      const r = await create({ url: uurl('a1'), alias: a });
      expect(r.status, `${a}: ${r.text}`).toBe(201);
      expect(r.json.code).toBe(a);
    }
  });

  const bad: [string, string][] = [
    ['exclamation mark', `ab!${uid(6)}`],
    ['dot', `ab.${uid(6)}`],
    ['inner space', `ab ${uid(6)}`],
    ['slash', `ab/${uid(6)}`],
    ['percent-escape', `ab%41${uid(6)}`],
    ['plus', `ab+${uid(6)}`],
    ['tilde', `ab~${uid(6)}`],
    ['colon', `ab:${uid(6)}`],
    ['non-ASCII letter', `über${uid(6)}`],
    ['Arabic-Indic digit', `ab${uid(6)}١`],
    ['full-width letters', `ＡＢＣ${uid(6)}`],
    ['emoji', `ab${uid(6)}\u{1F600}`],
    ['trailing newline (\\z semantics)', `${uid(8)}\n`],
    ['leading newline', `\n${uid(8)}`],
    ['NUL byte', `ab${uid(6)}\u0000`],
  ];
  test.each(bad)('[R-ALIAS-1] alias with %s -> 422 invalid_alias', async (_label, a) => {
    expectError(await create({ url: uurl('a1'), alias: a }), 422, 'invalid_alias');
  });

  test.each(['favicon.ico', 'robots.txt', 'openapi.json'])('[R-ALIAS-1][R-ALIAS-2] %s -> 422 invalid_alias (pattern checked before the reserved list)', async (a) => {
    expectError(await create({ url: uurl('a1'), alias: a }), 422, 'invalid_alias');
  });

  test.each(RESERVED)('[R-ALIAS-2] reserved alias %j -> 422 alias_reserved', async (a) => {
    expectError(await create({ url: uurl('a2'), alias: a }), 422, 'alias_reserved');
  });

  test.each(['API', 'Healthz', 'DOCS', 'aDmIn', 'Static', 'ASSETS', 'LogIn', 'logOUT'])(
    '[R-ALIAS-2] reserved aliases compare case-insensitively: %j -> 422 alias_reserved',
    async (a) => {
      expectError(await create({ url: uurl('a2'), alias: a }), 422, 'alias_reserved');
    },
  );

  test('[R-ALIAS-2] only exact (case-insensitive) matches are reserved: prefixes and suffixes are fine', async () => {
    for (const a of [`admin${uid(4)}`, `${uid(4)}Login`, `API_${uid(4)}`, `docs-${uid(4)}`]) {
      const r = await create({ url: uurl('a2'), alias: a });
      expect(r.status, `${a}: ${r.text}`).toBe(201);
      expect(r.json.code).toBe(a);
    }
  });

  test('[R-ALIAS-3] an alias already in use -> 409 alias_taken, and the existing link is unchanged', async () => {
    const a = alias('a3');
    const first = await createOk({ url: uurl('a3'), alias: a });
    const other = uurl('a3other');
    expectError(await create({ url: other, alias: a }), 409, 'alias_taken', [a, other]);
    expectError(await create({ url: first.url, alias: a }), 409, 'alias_taken', [a]);
    const g = await getLinkOk(a);
    expect(g.url).toBe(first.url);
    expect(g.createdAt).toBe(first.createdAt);
  });

  test('[R-ALIAS-3] an alias equal to an existing generated code -> 409 alias_taken', async () => {
    const g = await createOk({ url: uurl('a3g') });
    expectError(await create({ url: uurl('a3g'), alias: g.code }), 409, 'alias_taken', [g.code]);
    expect((await getLinkOk(g.code)).isCustom).toBe(false);
  });

  test('[R-ALIAS-4] codes are case-sensitive: Launch-x and launch-x are different links', async () => {
    const id = uid(8);
    const upper = `Launch-${id}`;
    const lower = `launch-${id}`;
    const u1 = uurl('upper');
    const u2 = uurl('lower');
    const r1 = await create({ url: u1, alias: upper });
    const r2 = await create({ url: u2, alias: lower });
    expect(r1.status).toBe(201);
    expect(r2.status, r2.text).toBe(201);
    expect((await getLinkOk(upper)).url).toBe(u1);
    expect((await getLinkOk(lower)).url).toBe(u2);
    expect((await follow(upper)).headers['location']).toBe(u1);
    expect((await follow(lower)).headers['location']).toBe(u2);
    expectError(await getLink(`LAUNCH-${id}`), 404, 'not_found');
  });
});
