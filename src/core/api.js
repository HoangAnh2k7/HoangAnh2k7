import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const MAX_BODY = 1024 * 1024;
function authenticated(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const expected = Buffer.from(token); const supplied = Buffer.from(header.slice(7));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
function respond(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(body));
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = []; let failed = false;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { if (!failed) { failed = true; reject(Object.assign(new Error('Request body quá lớn'), { status: 413 })); } return; }
      if (!failed) chunks.push(chunk);
    });
    request.on('end', () => {
      if (failed) return;
      try { const text = Buffer.concat(chunks).toString('utf8'); resolve(text ? JSON.parse(text) : {}); }
      catch { reject(Object.assign(new Error('JSON không hợp lệ'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

export function startApi({ port = 32187, token, dispatch }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Cổng API không hợp lệ');
  if (typeof token !== 'string' || token.length < 32) throw new Error('API token cần ít nhất 32 ký tự');
  if (typeof dispatch !== 'function') throw new Error('Thiếu API dispatcher');
  const server = http.createServer(async (request, response) => {
    const host = request.headers.host || '';
    if (!/^127\.0\.0\.1(?::\d+)?$/.test(host)) { respond(response, 403, { error: 'Host không được phép' }); return; }
    if (request.headers.origin) { respond(response, 403, { error: 'Không cho phép yêu cầu từ trang web' }); return; }
    if (!authenticated(request.headers.authorization, token)) { respond(response, 401, { error: 'API token không hợp lệ' }); return; }
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      let method; let args = {};
      if (request.method === 'GET' && pathname === '/v1/state') method = 'state';
      else if (request.method === 'POST' && pathname === '/v1/profiles') { method = 'profile.save'; args = await readBody(request); }
      else {
        const profile = /^\/v1\/profiles\/([A-Za-z0-9_-]{1,100})\/(start|stop)$/.exec(pathname);
        const workflow = /^\/v1\/workflows\/([A-Za-z0-9_-]{1,100})\/run$/.exec(pathname);
        if (request.method === 'POST' && profile) { method = `profile.${profile[2]}`; args = { id: profile[1] }; await readBody(request); }
        else if (request.method === 'POST' && workflow) { method = 'workflow.run'; const body = await readBody(request); args = { id: workflow[1], profileIds: body.profileIds }; }
        else { respond(response, 404, { error: 'Không tìm thấy API' }); return; }
      }
      const result = await dispatch(method, args);
      // State can contain credentials locally; the API deliberately omits tokens and proxy passwords.
      if (method === 'state' && result && typeof result === 'object') {
        const clean = structuredClone(result);
        if (clean.settings) delete clean.settings.apiToken;
        if (Array.isArray(clean.proxies)) for (const proxy of clean.proxies) { delete proxy.password; delete proxy.username; }
        respond(response, 200, { data: clean });
      } else respond(response, 200, { data: result ?? null });
    } catch (error) { respond(response, error.status || 400, { error: error.message || 'API thất bại' }); }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server); });
  });
}
