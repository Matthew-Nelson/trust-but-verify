// Gray-box database access (SPEC "Data model"). Only used by tests tagged [gray-box], which skip
// when DATABASE_URL is unset. The harness never supplies id values and only writes R-DATA-2 encodings.
import pg from 'pg';
import { DATABASE_URL } from './config.ts';
import { retryIfDayChanged } from './links.ts';

let _pool: pg.Pool | undefined;

export function db(): pg.Pool {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is unset');
  _pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  return _pool;
}

export async function closeDb(): Promise<void> {
  if (_pool) await _pool.end();
  _pool = undefined;
}

/** The database clock (SPEC "Clock"): today's UTC date and now() as text with microseconds. */
export async function dbNow(): Promise<{ today: string; now: string }> {
  const r = await db().query(
    `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS today,
            to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`,
  );
  return r.rows[0];
}

export async function linkId(code: string): Promise<string> {
  const r = await db().query('SELECT id::text AS id FROM links WHERE code = $1', [code]);
  if (r.rowCount !== 1) throw new Error(`no links row for ${code}`);
  return r.rows[0].id;
}

/** Number of clicks rows stored for a code (R-GET-1 clickCount, read directly). */
export async function storedClicks(code: string): Promise<number> {
  const r = await db().query(
    'SELECT count(*)::int AS n FROM clicks WHERE link_id = (SELECT id FROM links WHERE code = $1)',
    [code],
  );
  return r.rows[0].n;
}

/** Does a links row with this code exist? */
export async function linkExists(code: string): Promise<boolean> {
  const r = await db().query('SELECT 1 FROM links WHERE code = $1', [code]);
  return r.rowCount === 1;
}

export interface SeedClick {
  at: string; // absolute timestamptz literal, e.g. '2026-10-17T00:00:00Z'
  referrer?: string | null; // normalized host or null (direct)
  country?: string | null; // two upper-case letters or null (unknown)
  device?: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
  count?: number;
}

/** Insert clicks rows directly (R-DATA-1). */
export async function seedClicks(code: string, clicks: SeedClick[]): Promise<void> {
  const id = await linkId(code);
  for (const c of clicks) {
    await db().query(
      `INSERT INTO clicks (link_id, clicked_at, referrer_host, country, device)
       SELECT $1::bigint, $2::timestamptz, $3, $4, $5 FROM generate_series(1, $6::int)`,
      [id, c.at, c.referrer ?? null, c.country ?? null, c.device ?? 'desktop', c.count ?? 1],
    );
  }
}

/** Run fn anchored to the database "today" (SPEC "Time"), retrying once across midnight UTC. */
export function anchoredToToday<T>(fn: (today: string) => Promise<T>): Promise<T> {
  return retryIfDayChanged(async () => (await dbNow()).today, fn);
}
