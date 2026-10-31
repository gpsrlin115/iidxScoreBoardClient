import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { scoreBrowserMockEnabled, scoreBrowserApiBaseURL, guardScoreBrowserMockRequest,
  requireScoreBrowserMockResponse, scoreBrowserMockError, isScoreBrowserMockError } from '../../src/api/scoreBrowserMockGuard.js';
import { createScoreBrowserMockProxyGuard } from './proxy.mjs';

test('mock forces /api even if environment supplies a production host', () => {
  const env = { VITE_SCORE_BROWSER_MOCK: '1', VITE_API_BASE_URL: 'https://production.invalid/api' };
  assert.equal(scoreBrowserMockEnabled(env), true);
  assert.equal(scoreBrowserApiBaseURL(env), '/api');
  assert.equal(scoreBrowserMockEnabled({ VITE_SCORE_BROWSER_MOCK: '0' }), false);
});
test('request guard accepts local /api requests and blocks absolute URLs and base overrides', () => {
  assert.equal(guardScoreBrowserMockRequest({ baseURL: '/api', url: '/scores' }, 'http://127.0.0.1:5173').url, '/scores');
  for (const url of ['https://production.invalid/api/scores', 'http://127.0.0.1:5173/api/scores', '//production.invalid/api/scores',
    '../outside', '/%2e%2e/outside', '/%2foutside', '/%252foutside', '/bad\\path']) {
    assert.throws(() => guardScoreBrowserMockRequest({ baseURL: '/api', url }, 'http://127.0.0.1:5173'), /모의 서버/);
  }
  assert.throws(() => guardScoreBrowserMockRequest({ baseURL: 'https://production.invalid/api', url: '/scores' }, 'http://localhost:5173'));
});
test('response guard requires marker on successes and errors without trusting missing transport', () => {
  const marked = { headers: { 'X-Score-Browser-Mock': '1' } };
  assert.equal(requireScoreBrowserMockResponse(marked), marked);
  assert.throws(() => requireScoreBrowserMockResponse({ headers: {} }));
  const actual = { response: marked };
  assert.equal(scoreBrowserMockError(actual), actual);
  for (const error of [{}, { response: { headers: {} } }]) assert.equal(isScoreBrowserMockError(scoreBrowserMockError(error)), true);
});
test('proxy verifies every /api request, keeps credentials out of identity requests and fails closed', async () => {
  let marker = true, service = 'iidx-score-browser-mock', identities = 0;
  const identityServer = createServer((req, res) => {
    assert.equal(req.url, '/__mock/identity');
    assert.equal(req.headers.cookie, undefined);
    identities += 1;
    res.writeHead(200, { 'Content-Type': 'application/json', ...(marker ? { 'X-Score-Browser-Mock': '1' } : {}) });
    res.end(JSON.stringify({ service, version: 1 }));
  });
  identityServer.listen(0, '127.0.0.1'); await once(identityServer, 'listening');
  const target = `http://127.0.0.1:${identityServer.address().port}`;
  let middleware;
  createScoreBrowserMockProxyGuard({ target }).configureServer({ middlewares: { use: (value) => { middleware = value; } } });
  const invoke = (url) => new Promise((resolve) => {
    const res = { destroyed: false, writableEnded: false,
      writeHead: (status) => { res.status = status; }, end: (body) => resolve({ status: res.status, body }) };
    middleware({ url, headers: { cookie: 'REAL_COOKIE_NOT_FORWARDED=1' } }, res, () => resolve({ status: 200 }));
  });
  try {
    assert.equal((await invoke('/api/scores')).status, 200);
    assert.equal((await invoke('/api?test=1')).status, 200);
    marker = false;
    assert.equal((await invoke('/api/scores')).status, 503);
    marker = true; service = 'other-service';
    assert.equal((await invoke('/api/scores')).status, 503);
    assert.equal((await invoke('/assets/example.js')).status, 200);
    assert.equal(identities, 4);
  } finally { await new Promise((resolve) => identityServer.close(resolve)); }
  assert.equal((await invoke('/api/scores')).status, 503);
});
