#!/usr/bin/env node
// Self-check stub for `pnpm fuzz` (SELF_CHECK.md, run 10). It is NOT an implementation of the spec.
// It shows two things about the fuzz configuration:
//   - GET/HEAD /{code} answer a schema-conforming 302 whose Location points at a separate local "external"
//     sink. The 302 must be recorded and validated, not raise a network error, and the sink must log
//     zero requests (no redirect is ever followed).
//   - GET /healthz answers 200 {"status":"nope"}, which violates the Health schema (const "ok"). The
//     response_schema_conformance check must still fail on it.
// Other operations get minimal, mostly conforming answers. Every request is logged, so the log also
// shows whether generation added undefined parameters (it must not; HP-24).
//
// Usage: node scripts/fuzz-stub.mjs <stubPort> <sinkPort> <logFile>
import http from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';

const [stubPort, sinkPort, logFile] = [Number(process.argv[2] || 4020), Number(process.argv[3] || 4021), process.argv[4] || 'fuzz-stub.log'];
writeFileSync(logFile, '');
const log = (line) => appendFileSync(logFile, line + '\n');

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extra });
  res.end(JSON.stringify(body));
};
const err = (res, status, code, extra = {}) => json(res, status, { error: { code, message: 'Stub error.' } }, extra);

http
  .createServer((req, res) => {
    const u = new URL(req.url, 'http://stub');
    const p = u.pathname;
    const m = req.method;
    log(`STUB ${m} ${req.url}`);
    req.resume();
    if (p === '/healthz') {
      if (m === 'GET') return json(res, 200, { status: 'nope' }); // deliberate schema violation
      if (m === 'HEAD') return res.writeHead(200, { 'Content-Type': 'application/json' }).end();
      return err(res, 405, 'method_not_allowed', { Allow: 'GET, HEAD' });
    }
    if (p === '/api/links') {
      if (m === 'POST') return err(res, 400, 'bad_request');
      if (m === 'GET') return json(res, 200, { items: [], total: 0, limit: 20, offset: 0 });
      if (m === 'HEAD') return res.writeHead(200, { 'Content-Type': 'application/json' }).end();
      return err(res, 405, 'method_not_allowed', { Allow: 'GET, HEAD, POST' });
    }
    if (p.startsWith('/api/')) {
      if (/^\/api\/links\/[^/]+(\/stats)?$/.test(p)) {
        const allow = p.endsWith('/stats') ? 'GET, HEAD' : 'GET, HEAD, DELETE';
        if (!allow.split(', ').includes(m)) return err(res, 405, 'method_not_allowed', { Allow: allow });
        if (m === 'HEAD') return res.writeHead(404, { 'Content-Type': 'application/json' }).end();
        return err(res, 404, 'not_found');
      }
      return err(res, 404, 'not_found');
    }
    if (/^\/[^/]+$/.test(p)) {
      if (m === 'GET' || m === 'HEAD') {
        // Schema-conforming 302 to an "external" URL served by the local sink.
        res.writeHead(302, { Location: `http://127.0.0.1:${sinkPort}/external${p}`, 'Cache-Control': 'no-store' });
        return res.end();
      }
      res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, HEAD' });
      return res.end('Method not allowed');
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  })
  .listen(stubPort, '127.0.0.1');

http
  .createServer((req, res) => {
    log(`SINK-FOLLOWED ${req.method} ${req.url}`); // any line here means a redirect was followed
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('sink');
  })
  .listen(sinkPort, '127.0.0.1');

console.log(`fuzz stub on 127.0.0.1:${stubPort}, external sink on 127.0.0.1:${sinkPort}, log ${logFile}`);
