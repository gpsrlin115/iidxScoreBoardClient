import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { createNoteRadarMockProxyGuard } from '../scripts/note-radar-mock-proxy.mjs';
import { NOTE_RADAR_MOCK_API_CONTEXT } from '../scripts/note-radar-mock-contract.mjs';
import { createNoteRadarMockServer } from '../scripts/note-radar-mock.mjs';
import { CHARTS } from '../scripts/note-radar-mock-data.mjs';

const identity = { service: 'iidx-note-radar-mock', version: 1 };
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = (server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
const sendJson = (res, status, body, marker = '1') => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...(marker == null ? {} : { 'X-Note-Radar-Mock': marker }) });
  res.end(JSON.stringify(body));
};

async function frontend(t, target, timeoutMs = 2000) {
  const vite = await createViteServer({
    configFile: false, plugins: [createNoteRadarMockProxyGuard({ target, timeoutMs })],
    server: { middlewareMode: true, hmr: false, ws: false, proxy: { [NOTE_RADAR_MOCK_API_CONTEXT]: { target, changeOrigin: true } } },
  });
  const server = createHttpServer((req, res) => vite.middlewares(req, res, () => { res.writeHead(404); res.end(); }));
  const base = await listen(server);
  t.after(async () => { await close(server); await vite.close(); });
  return base;
}

async function fakeTarget(t, initial = 'valid') {
  let mode = initial;
  const seen = { identity: [], api: [] };
  const server = createHttpServer(async (req, res) => {
    if (req.url === '/__mock/identity') {
      seen.identity.push({ method: req.method, headers: req.headers });
      if (mode === 'timeout') return;
      if (mode === 'body-timeout') { res.writeHead(200, { 'Content-Type': 'application/json', 'X-Note-Radar-Mock': '1' }); res.flushHeaders(); return; }
      if (mode === 'redirect') { res.writeHead(302, { Location: '/redirected' }); res.end(); return; }
      if (mode === '404') return sendJson(res, 404, identity);
      if (mode === 'header') return sendJson(res, 200, identity, null);
      if (mode === 'wrong-header') return sendJson(res, 200, identity, 'true');
      if (mode === 'bad-json') { res.writeHead(200, { 'X-Note-Radar-Mock': '1' }); res.end('not json'); return; }
      if (mode === 'service') return sendJson(res, 200, { ...identity, service: 'real-backend' });
      if (mode === 'version') return sendJson(res, 200, { ...identity, version: 2 });
      if (mode === 'string-version') return sendJson(res, 200, { ...identity, version: '1' });
      if (mode === 'extra-fields') return sendJson(res, 200, { ...identity, fallback: true });
      if (mode === 'status') return sendJson(res, 201, identity);
      return sendJson(res, 200, identity);
    }
    seen.api.push({ method: req.method, path: req.url, headers: req.headers });
    sendJson(res, 200, { received: true });
  });
  const base = await listen(server);
  t.after(() => close(server));
  return { base, seen, mode: (next) => { mode = next; } };
}

for (const mode of ['404', 'header', 'wrong-header', 'bad-json', 'service', 'version', 'string-version', 'extra-fields', 'status', 'redirect', 'timeout', 'body-timeout']) {
  test(`mock proxy blocks the first API write when identity is ${mode}`, async (t) => {
    const target = await fakeTarget(t, mode);
    const base = await frontend(t, target.base, mode.includes('timeout') ? 200 : 2000);
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await fetch(`${base}/api/note-radar/goals`, { method, headers: { Cookie: 'real=session', 'X-XSRF-TOKEN': 'real-token' }, body: method === 'DELETE' ? undefined : '{}' });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, 'NOTE_RADAR_MOCK_UNAVAILABLE');
    }
    assert.equal(target.seen.api.length, 0, 'No API request may reach an unverified target');
    assert.equal(target.seen.identity.length, 3);
    for (const probe of target.seen.identity) {
      assert.equal(probe.method, 'GET');
      assert.equal(probe.headers.cookie, undefined);
      assert.equal(probe.headers['x-xsrf-token'], undefined);
      assert.match(probe.headers['cache-control'] ?? '', /no-cache|no-store/);
    }
  });
}

test('the identity result is checked again before every API request and is never cached', async (t) => {
  const target = await fakeTarget(t);
  const base = await frontend(t, target.base);
  assert.equal((await fetch(`${base}/api/note-radar/goals`, { method: 'PUT', body: '{}' })).status, 200);
  target.mode('service');
  const denied = await fetch(`${base}/api/note-radar/goals/1`, { method: 'DELETE' });
  assert.equal(denied.status, 503);
  assert.equal(target.seen.identity.length, 2);
  assert.equal(target.seen.api.length, 1);
  assert.equal(target.seen.api[0].method, 'PUT');
});

test('replacing a verified mock with a non-mock server on the same port blocks every later write', async (t) => {
  const mock = createNoteRadarMockServer();
  const target = await listen(mock);
  let activeTarget = mock;
  t.after(() => close(activeTarget));
  const base = await frontend(t, target);
  const auth = await fetch(`${base}/api/users/me`);
  assert.equal(auth.status, 200);
  assert.equal(auth.headers.get('x-note-radar-mock'), '1');
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  const token = cookie.slice(cookie.indexOf('=') + 1);
  await auth.json();
  const port = mock.address().port;
  await close(mock);
  const seen = { identity: [], api: [] };
  const replacement = createHttpServer((req, res) => {
    if (req.url === '/__mock/identity') {
      seen.identity.push({ method: req.method, headers: req.headers });
      return sendJson(res, 404, { code: 'NOT_FOUND' }, null);
    }
    seen.api.push({ method: req.method, path: req.url });
    return sendJson(res, 200, { received: true }, null);
  });
  await new Promise((resolve, reject) => {
    replacement.once('error', reject);
    replacement.listen(port, '127.0.0.1', resolve);
  });
  activeTarget = replacement;
  assert.equal(`http://127.0.0.1:${replacement.address().port}`, target);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await fetch(`${base}/api/note-radar/goals`, { method,
      headers: { Cookie: cookie, 'X-XSRF-TOKEN': token, 'Content-Type': 'application/json' },
      ...(method === 'DELETE' ? {} : { body: '{}' }),
    });
    assert.equal(response.status, 503, method);
    assert.equal((await response.json()).code, 'NOTE_RADAR_MOCK_UNAVAILABLE');
  }
  assert.equal(seen.api.length, 0, 'Original API requests must not reach the replacement server');
  assert.equal(seen.identity.length, 3);
  for (const probe of seen.identity) {
    assert.equal(probe.method, 'GET');
    assert.equal(probe.headers.cookie, undefined);
    assert.equal(probe.headers['x-xsrf-token'], undefined);
  }
});

test('guard covers /api itself and query strings without intercepting unrelated frontend paths', async (t) => {
  const target = await fakeTarget(t, 'service');
  const base = await frontend(t, target.base);
  for (const path of ['/api', '/api?foo=1', '/api/users/me', '/api/note-radar/imports?foo=1']) {
    assert.equal((await fetch(`${base}${path}`, { method: 'POST' })).status, 503, path);
  }
  const probes = target.seen.identity.length;
  for (const path of ['/apiary', '/note-radar', '/__mock/identity']) assert.notEqual((await fetch(`${base}${path}`)).status, 503, path);
  assert.equal(target.seen.identity.length, probes);
  assert.equal(target.seen.api.length, 0);
});

test('unreachable target returns local JSON unavailable before proxying the API request', async (t) => {
  const target = createHttpServer();
  const origin = await listen(target);
  await close(target);
  const base = await frontend(t, origin);
  const response = await fetch(`${base}/api/note-radar/goals`, { method: 'PUT', body: '{}' });
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal((await response.json()).code, 'NOTE_RADAR_MOCK_UNAVAILABLE');
});

test('verified mock supports auth cookies, CSRF validation, goal save, update and deletion through Vite', async (t) => {
  const mock = createNoteRadarMockServer();
  const target = await listen(mock);
  t.after(() => close(mock));
  const base = await frontend(t, target);
  const auth = await fetch(`${base}/api/users/me`);
  assert.equal(auth.status, 200);
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const request = (path, method, body, headers = {}) => fetch(`${base}/api${path}`, { method,
    headers: { Cookie: cookie, 'X-XSRF-TOKEN': token, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const goal = { chartId: CHARTS[0].chartId, category: 'NOTES', targetExScore: 0 };
  assert.equal((await request('/note-radar/goals', 'PUT', goal, { 'X-XSRF-TOKEN': 'wrong' })).status, 403);
  const savedResponse = await request('/note-radar/goals', 'PUT', goal);
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json();
  assert.equal(saved.targetExScore, 0);
  const updated = await (await request('/note-radar/goals', 'PUT', { ...goal, targetExScore: 100 })).json();
  assert.equal(updated.id, saved.id);
  assert.equal(updated.targetExScore, 100);
  assert.equal((await request(`/note-radar/goals/${saved.id}`, 'DELETE')).status, 204);
  const goals = await (await request('/note-radar/goals', 'GET')).json();
  assert.equal(goals.some((row) => row.id === saved.id), false);
});
