// HTTP clients for the harness. Framework-neutral (no vitest/playwright imports).
//
// - api():       fetch with redirect: "manual" (the normal path).
// - raw():       node:http with an exact request-target and a raw header list, for things
//                fetch can't send: duplicate headers, non-UTF-8 header bytes, no User-Agent,
//                unnormalized paths (dot segments, "//", bad escapes), arbitrary methods.
// - rawSocket(): a bare TCP exchange, to prove a HEAD response carries no body bytes.
//
// Every response from /healthz or /api/<non-empty> with status >= 400 is checked on the spot
// against R-ERR-1 (JSON error envelope), R-ERR-4 (message patterns) and R-ERR-7 (500 body),
// and the call throws if it violates them. This makes those rules apply to every test.
import http from 'node:http';
import net from 'node:net';
import { TARGET_API, UA, RETRY_REFUSED } from './config.ts';

export interface Res {
  status: number;
  /** Lower-cased header names; repeated headers joined with ", ". */
  headers: Record<string, string>;
  rawHeaders: string[];
  bytes: Buffer;
  text: string;
  /** Parsed JSON body, or undefined if the body isn't JSON. */
  json: any;
  /** Milliseconds from sending the request until response headers arrived. */
  ms: number;
  /** performance.now() when the response headers arrived. */
  headersAt: number;
  method: string;
  path: string;
}

export const ERROR_CODES = [
  'bad_request',
  'invalid_url',
  'invalid_alias',
  'alias_reserved',
  'alias_taken',
  'not_found',
  'method_not_allowed',
  'unavailable',
  'internal',
] as const;

/** R-ERR-4 forbidden message patterns (case-insensitive). */
export const FORBIDDEN_MESSAGE_PATTERNS = [
  /\b(select|insert|update|delete)\b.+\b(from|into|set|where)\b/i,
  /(traceback|exception|panic|goroutine|sqlstate|stack)/i,
  /(\/Users\/|\/home\/|\/usr\/|\/var\/|\/app\/|[A-Z]:\\)/i,
  /\.(js|ts|py|go|rs|java|rb):\d+/i,
];

export function mediaType(res: Pick<Res, 'headers'>): string {
  return (res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
}

/** Does R-ERR-1 apply to this request path? `/healthz`, or `/api/` plus a non-empty remainder. */
export function isJsonErrorPath(path: string): boolean {
  const p = path.split('?')[0];
  return p === '/healthz' || (p.startsWith('/api/') && p.length > '/api/'.length);
}

export class ContractViolation extends Error {}

/** Throws ContractViolation if res breaks R-ERR-1 / R-ERR-4 / R-ERR-7. */
export function checkErrorEnvelope(res: Res): void {
  if (res.status < 400 || !isJsonErrorPath(res.path)) return;
  const where = `${res.method} ${res.path} -> ${res.status}`;
  const ct = mediaType(res);
  if (ct !== 'application/json') {
    throw new ContractViolation(`[R-ERR-1] ${where}: Content-Type is "${res.headers['content-type'] ?? '(none)'}", expected application/json`);
  }
  if (res.method === 'HEAD') return; // no body on HEAD (R-ERR-8)
  const b = res.json;
  const okShape =
    b &&
    typeof b === 'object' &&
    !Array.isArray(b) &&
    Object.keys(b).length === 1 &&
    b.error &&
    typeof b.error === 'object' &&
    !Array.isArray(b.error) &&
    Object.keys(b.error).sort().join(',') === 'code,message' &&
    typeof b.error.code === 'string' &&
    typeof b.error.message === 'string' &&
    b.error.message.trim().length > 0 &&
    (ERROR_CODES as readonly string[]).includes(b.error.code);
  if (!okShape) {
    throw new ContractViolation(`[R-ERR-1] ${where}: body is not {"error":{"code","message"}} with a known code: ${res.text.slice(0, 300)}`);
  }
  for (const re of FORBIDDEN_MESSAGE_PATTERNS) {
    if (re.test(b.error.message)) {
      throw new ContractViolation(`[R-ERR-4] ${where}: message ${JSON.stringify(b.error.message)} matches ${re}`);
    }
  }
  if (res.status === 500) {
    if (res.text !== '{"error":{"code":"internal","message":"Internal server error."}}' &&
      !(b.error.code === 'internal' && b.error.message === 'Internal server error.')) {
      throw new ContractViolation(`[R-ERR-7] ${where}: 500 body is not the canonical internal error: ${res.text}`);
    }
  }
}

function finish(partial: Omit<Res, 'text' | 'json'>): Res {
  const text = partial.bytes.toString('utf8');
  let json: any = undefined;
  if (text.length) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }
  const res: Res = { ...partial, text, json };
  checkErrorEnvelope(res);
  return res;
}

export interface ApiOpts {
  json?: unknown;
  body?: string | Uint8Array;
  headers?: Record<string, string>;
  base?: string;
  signal?: AbortSignal;
}

/** fetch-based request. Sets User-Agent explicitly; never follows redirects. */
export function api(method: string, path: string, opts: ApiOpts = {}): Promise<Res> {
  return retryRefused(() => apiOnce(method, path, opts));
}

/**
 * Self-check only (HARNESS_RETRY_REFUSED=1): retry for up to 5 s while the target refuses connections,
 * so a crashing-and-restarting mock doesn't turn assertion failures into connection errors.
 */
async function retryRefused<T>(fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  for (;;) {
    try {
      return await fn();
    } catch (e: any) {
      const refused = e?.code === 'ECONNREFUSED' || e?.cause?.code === 'ECONNREFUSED';
      if (!RETRY_REFUSED || !refused || performance.now() - t0 > 5000) throw e;
      await sleep(100);
    }
  }
}

async function apiOnce(method: string, path: string, opts: ApiOpts): Promise<Res> {
  const headers: Record<string, string> = { 'user-agent': UA, ...lower(opts.headers ?? {}) };
  let body: string | Uint8Array | undefined = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['content-type'] ??= 'application/json';
  }
  const t0 = performance.now();
  const r = await fetch((opts.base ?? TARGET_API) + path, {
    method,
    headers,
    body: body as any,
    redirect: 'manual',
    signal: opts.signal,
  });
  const headersAt = performance.now();
  const bytes = Buffer.from(await r.arrayBuffer());
  const h: Record<string, string> = {};
  const rawHeaders: string[] = [];
  r.headers.forEach((v, k) => {
    h[k] = v;
    rawHeaders.push(k, v);
  });
  return finish({ status: r.status, headers: h, rawHeaders, bytes, ms: headersAt - t0, headersAt, method, path });
}

function lower(h: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) o[k.toLowerCase()] = v;
  return o;
}

export interface RawOpts {
  /** Flat [name, value, name, value, ...]. Values are sent as latin1 bytes (see utf8Header). */
  headers?: string[];
  body?: string | Buffer;
  /** Header names (lower-case) the helper must NOT add by default (e.g. 'user-agent'). */
  omit?: string[];
  base?: string;
  timeoutMs?: number;
}

/** Encode a Unicode string as UTF-8 bytes carried in a latin1 JS string, for raw header values. */
export function utf8Header(s: string): string {
  return Buffer.from(s, 'utf8').toString('latin1');
}

/** node:http request with an exact request-target and raw header list. */
export function raw(method: string, path: string, opts: RawOpts = {}): Promise<Res> {
  return retryRefused(() => rawOnce(method, path, opts));
}

function rawOnce(method: string, path: string, opts: RawOpts): Promise<Res> {
  const base = new URL(opts.base ?? TARGET_API);
  const list = [...(opts.headers ?? [])];
  const names = new Set(list.filter((_, i) => i % 2 === 0).map((n) => n.toLowerCase()));
  const omit = new Set(opts.omit ?? []);
  if (!names.has('host')) list.unshift('Host', base.host);
  if (!names.has('user-agent') && !omit.has('user-agent')) list.push('User-Agent', UA);
  const body = opts.body === undefined ? undefined : Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(opts.body, 'utf8');
  if (body && !names.has('content-length')) list.push('Content-Length', String(body.length));
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const req = http.request(
      {
        host: base.hostname.replace(/^\[|\]$/g, ''),
        port: base.port || 80,
        method,
        path,
        headers: list,
        agent: false,
        setHost: false,
      } as any,
      (res) => {
        const headersAt = performance.now();
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const h: Record<string, string> = {};
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            const k = res.rawHeaders[i].toLowerCase();
            h[k] = h[k] === undefined ? res.rawHeaders[i + 1] : `${h[k]}, ${res.rawHeaders[i + 1]}`;
          }
          try {
            resolve(
              finish({
                status: res.statusCode ?? 0,
                headers: h,
                rawHeaders: res.rawHeaders,
                bytes: Buffer.concat(chunks),
                ms: headersAt - t0,
                headersAt,
                method,
                path,
              }),
            );
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      },
    );
    req.setTimeout(opts.timeoutMs ?? 15000, () => req.destroy(new Error(`timeout: ${method} ${path}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export interface SocketRes {
  statusLine: string;
  status: number;
  headers: Record<string, string>;
  /** Bytes received after the blank line that ends the header block. */
  afterHeaders: Buffer;
}

/**
 * Send one HTTP/1.1 request over a fresh TCP connection with "Connection: close" and return
 * everything the server sent. Used to prove HEAD responses have no body (R-ERR-8, R-REDIR-7).
 */
export function rawSocket(method: string, path: string, extraHeaders: string[] = [], base = TARGET_API): Promise<SocketRes> {
  return retryRefused(() => rawSocketOnce(method, path, extraHeaders, base));
}

function rawSocketOnce(method: string, path: string, extraHeaders: string[], base: string): Promise<SocketRes> {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port || 80) });
    const chunks: Buffer[] = [];
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      sock.destroy();
      const all = Buffer.concat(chunks);
      const idx = all.indexOf('\r\n\r\n');
      if (idx < 0) return reject(new Error(`no complete header block from ${method} ${path}: ${all.toString('latin1').slice(0, 200)}`));
      const head = all.subarray(0, idx).toString('latin1').split('\r\n');
      const headers: Record<string, string> = {};
      for (const line of head.slice(1)) {
        const c = line.indexOf(':');
        const k = line.slice(0, c).trim().toLowerCase();
        const v = line.slice(c + 1).trim();
        headers[k] = headers[k] === undefined ? v : `${headers[k]}, ${v}`;
      }
      resolve({ statusLine: head[0], status: Number(head[0].split(' ')[1]), headers, afterHeaders: all.subarray(idx + 4) });
    };
    sock.on('data', (c) => chunks.push(c));
    sock.on('end', done);
    sock.on('close', done);
    sock.on('error', (e) => (settled ? undefined : (settled = true, reject(e))));
    // If the server ignores "Connection: close", give it 1.5 s of silence after the headers.
    sock.setTimeout(1500, done);
    const lines = [`${method} ${path} HTTP/1.1`, `Host: ${u.host}`, `User-Agent: ${UA}`, 'Connection: close'];
    for (let i = 0; i < extraHeaders.length; i += 2) lines.push(`${extraHeaders[i]}: ${extraHeaders[i + 1]}`);
    sock.write(lines.join('\r\n') + '\r\n\r\n');
  });
}

/** Parse an Allow header into a set of method tokens (R-ERR-6: compare sets, not strings). */
export function allowSet(res: Pick<Res, 'headers'>): Set<string> | undefined {
  const v = res.headers['allow'];
  if (v === undefined) return undefined;
  return new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
}

/** Directive names in Cache-Control, lower-cased. */
export function cacheDirectives(res: Pick<Res, 'headers'>): string[] {
  return (res.headers['cache-control'] ?? '')
    .split(',')
    .map((d) => d.split('=')[0].trim().toLowerCase())
    .filter(Boolean);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
