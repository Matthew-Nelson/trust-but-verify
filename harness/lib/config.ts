// Harness configuration. Defaults follow SPEC "Configuration".
const E = process.env;
const strip = (s: string) => s.replace(/\/+$/, '');

export const TARGET_API = strip(E.TARGET_API || 'http://localhost:8080');
export const TARGET_WEB = strip(E.TARGET_WEB || 'http://localhost:3000');
/** The PUBLIC_BASE_URL the api under test runs with (R-LINK-4, R-URL-4). SPEC default. */
export const PUBLIC_BASE_URL = strip(E.PUBLIC_BASE_URL || 'http://localhost:8080');
/** The COUNTRY_HEADER the api under test runs with (R-CLICK-2). SPEC default. */
export const COUNTRY_HEADER = E.COUNTRY_HEADER || 'cf-ipcountry';
/** Gray-box only. Leave unset and every gray-box test skips. */
export const DATABASE_URL = E.DATABASE_URL || undefined;
/** Optional api executable for spawned-instance tests (R-HEALTH-1 503 branch, R-HEALTH-2, R-HEALTH-3, R-PRIV-1 logs). */
export const API_BIN = E.API_BIN || undefined;

/** Self-check only: skip createOk's echo verification so each test reaches its own assertions. */
export const LENIENT_SETUP = E.HARNESS_LENIENT_SETUP === '1';

/** Self-check only: retry requests while the target refuses connections (a restarting mock). */
export const RETRY_REFUSED = E.HARNESS_RETRY_REFUSED === '1';

export const hasDb = !!DATABASE_URL;
export const hasBin = !!API_BIN;
export const GRAY_SKIP =
  'gray-box: DATABASE_URL is unset, so this test is skipped (set DATABASE_URL to the api database to run it)';
export const SPAWN_SKIP =
  'gray-box: API_BIN is unset, so this spawned-instance test is skipped (set API_BIN to the api executable to run it)';

/** Explicit client User-Agent (SPEC "Client headers"); R-CLICK-3 classifies it as desktop. */
export const UA = 'ShortlinkAcceptance/1.0 (Macintosh; harness)';

export const PUBLIC_HOSTNAME = new URL(PUBLIC_BASE_URL).hostname;
