// Gray-box storage and schema checks (R-DATA-2, R-DATA-3, R-PRIV-1 database half).
import net from 'node:net';
import { describe, expect, test } from 'vitest';
import { COUNTRY_HEADER, GRAY_SKIP, TARGET_API, hasDb } from '../../lib/config.ts';
import { createOk, followRaw, uurl, waitForRangeClicks } from '../../lib/links.ts';
import { db, linkId } from '../../lib/db.ts';
import { addressForms } from '../../lib/addr.ts';

/** The address the api sees for this client: the local address of a TCP connection to TARGET_API. */
async function clientAddress(): Promise<string> {
  const u = new URL(TARGET_API);
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port || 80) }, () => {
      const a = s.localAddress!;
      s.destroy();
      resolve(a);
    });
    s.on('error', reject);
  });
}

describe('storage (gray-box)', () => {
  test('[R-DATA-2][R-CLICK-1][R-CLICK-2][R-CLICK-3][gray-box] click columns use the stored encodings', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    const cases: { headers: string[]; omit?: string[]; ref: string | null; country: string | null; device: string }[] = [
      { headers: [], ref: null, country: null, device: 'desktop' },
      { headers: ['Referer', 'https://WWW.Example.com:8443/x', COUNTRY_HEADER, 'us'], ref: 'example.com', country: 'US', device: 'desktop' },
      { headers: ['Referer', 'https://direct/', COUNTRY_HEADER, 'USA', 'User-Agent', 'Googlebot'], ref: null, country: null, device: 'bot' },
      { headers: ['Referer', 'android-app://x/', 'User-Agent', 'Mozilla/5.0 (iPad)'], ref: null, country: null, device: 'tablet' },
      { headers: ['Referer', 'https://www.www.a.io/', COUNTRY_HEADER, 'xx', 'User-Agent', 'iPhone'], ref: 'www.a.io', country: 'XX', device: 'mobile' },
      { headers: [], omit: ['user-agent'], ref: null, country: null, device: 'unknown' },
    ];
    for (const c of cases) {
      const l = await createOk({ url: uurl('enc') });
      const r = await followRaw(l.code, c.headers, c.omit ?? []);
      await waitForRangeClicks(l.code, 1, r.headersAt);
      const rows = await db().query('SELECT referrer_host, country, device FROM clicks WHERE link_id = $1', [await linkId(l.code)]);
      expect(rows.rows).toEqual([{ referrer_host: c.ref, country: c.country, device: c.device }]);
    }
  });

  test('[R-DATA-2][gray-box] no click row anywhere stores \'\' or \'direct\' as referrer, or a non-upper-case country', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    const r = await db().query(
      `SELECT count(*)::int AS n FROM clicks
       WHERE referrer_host IN ('', 'direct')
          OR (country IS NOT NULL AND country !~ '^[A-Z]{2}$')
          OR device NOT IN ('desktop','mobile','tablet','bot','unknown')`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  test('[R-DATA-3][gray-box] migrations create exactly the SPEC schema (columns, keys, constraints, index, no triggers)', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    const q = (sql: string, p: unknown[] = []) => db().query(sql, p).then((r) => r.rows);
    const cols = await q(
      `SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity, identity_generation,
              character_maximum_length
         FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name IN ('links','clicks')
        ORDER BY table_name, ordinal_position`,
    );
    const shape = cols.map((c: any) => [c.table_name, c.column_name, c.data_type, c.is_nullable, c.is_identity === 'YES' ? c.identity_generation : '', c.character_maximum_length]);
    expect(shape).toEqual([
      ['clicks', 'id', 'bigint', 'NO', 'ALWAYS', null],
      ['clicks', 'link_id', 'bigint', 'NO', '', null],
      ['clicks', 'clicked_at', 'timestamp with time zone', 'NO', '', null],
      ['clicks', 'referrer_host', 'text', 'YES', '', null],
      ['clicks', 'country', 'character', 'YES', '', 2],
      ['clicks', 'device', 'text', 'NO', '', null],
      ['links', 'id', 'bigint', 'NO', 'ALWAYS', null],
      ['links', 'code', 'text', 'NO', '', null],
      ['links', 'url', 'text', 'NO', '', null],
      ['links', 'is_custom', 'boolean', 'NO', '', null],
      ['links', 'created_at', 'timestamp with time zone', 'NO', '', null],
    ]);
    const def = (t: string, c: string) => cols.find((x: any) => x.table_name === t && x.column_name === c)!.column_default ?? '';
    expect(def('links', 'is_custom')).toMatch(/^false$/i);
    expect(def('links', 'created_at')).toMatch(/now\(\)|CURRENT_TIMESTAMP/i);
    expect(def('clicks', 'clicked_at')).toMatch(/now\(\)|CURRENT_TIMESTAMP/i);

    const cons = await q(
      `SELECT rel.relname AS t, con.contype AS type, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = current_schema() AND rel.relname IN ('links','clicks')`,
    );
    const has = (t: string, type: string, re: RegExp) => cons.some((c: any) => c.t === t && c.type === type && re.test(c.def));
    expect(has('links', 'p', /PRIMARY KEY \(id\)/), 'links PK').toBe(true);
    expect(has('links', 'u', /UNIQUE \(code\)/), 'links UNIQUE(code)').toBe(true);
    expect(has('clicks', 'p', /PRIMARY KEY \(id\)/), 'clicks PK').toBe(true);
    expect(has('clicks', 'f', /FOREIGN KEY \(link_id\) REFERENCES links\(id\) ON DELETE CASCADE/), 'clicks FK cascade').toBe(true);
    expect(has('clicks', 'c', /device/), 'clicks device CHECK').toBe(true);
    const check = cons.find((c: any) => c.t === 'clicks' && c.type === 'c' && /device/.test(c.def))!.def as string;
    for (const v of ['desktop', 'mobile', 'tablet', 'bot', 'unknown']) expect(check).toContain(`'${v}'`);

    const idx = await q(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'clicks'`,
    );
    expect(idx.some((i: any) => /\(link_id, clicked_at\)/.test(i.indexdef)), 'INDEX ON clicks (link_id, clicked_at)').toBe(true);

    const trig = await q(
      `SELECT tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname IN ('links','clicks')`,
    );
    expect(trig, 'no triggers').toEqual([]);

    // Other relations: only a migration-bookkeeping table is allowed; no views or materialized views.
    const rels = await q(
      `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','v','m','p','f')
          AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
          AND NOT (n.nspname = current_schema() AND c.relname IN ('links','clicks'))`,
    );
    const extra = rels.filter((r: any) => !(r.kind === 'r' && /migrat|schema_(history|version)|flyway|refinery|diesel|sqlx|seaql/i.test(r.name)));
    expect(extra, 'unexpected tables/views besides links, clicks and one migration table').toEqual([]);
    expect(rels.length, 'at most one migration-bookkeeping table').toBeLessThanOrEqual(1);
  });

  test('[R-PRIV-1][gray-box] no column can hold a client address, and click rows do not contain this client\'s address', async (ctx) => {
    ctx.skip(!hasDb, GRAY_SKIP);
    const inet = await db().query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog','information_schema') AND data_type IN ('inet','cidr','macaddr','macaddr8')`,
    );
    expect(inet.rows).toEqual([]);
    const addr = await clientAddress();
    const l = await createOk({ url: uurl('priv') });
    const r = await followRaw(l.code, []);
    await waitForRangeClicks(l.code, 1, r.headersAt);
    const rows = await db().query(`SELECT row_to_json(c)::text AS j FROM clicks c WHERE link_id = $1`, [await linkId(l.code)]);
    for (const row of rows.rows) for (const form of addressForms(addr)) expect(row.j, `client address ${form} stored`).not.toContain(form);
    await ctx.annotate(`R-PRIV-1: searched click rows for client address ${addr} (${addressForms(addr).join(', ')})`);
  });
});
