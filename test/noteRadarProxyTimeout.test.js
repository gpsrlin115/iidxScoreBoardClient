import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { createNoteRadarMockProxyGuard } from '../scripts/note-radar-mock-proxy.mjs';

// The stall only appears when garbage collection runs between the identity
// headers and the body, so this test triggers collection itself instead of
// waiting for it to happen by chance. setFlagsFromString exposes gc() without
// a command-line flag.
setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc');

const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
});

function guardMiddleware(target, timeoutMs) {
  let middleware;
  createNoteRadarMockProxyGuard({ target, timeoutMs })
    .configureServer({ middlewares: { use: (fn) => { middleware = fn; } } });
  return middleware;
}

test('a stalled identity body is cut off at the timeout even after garbage collection', { timeout: 5000 }, async (t) => {
  const target = createServer((req, res) => {
    // The identity headers arrive, the body never finishes.
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Note-Radar-Mock': '1' });
    res.flushHeaders();
  });
  const base = await listen(target);
  t.after(() => new Promise((resolve) => { target.closeAllConnections(); target.close(resolve); }));

  const middleware = guardMiddleware(base, 200);
  const started = Date.now();
  const answered = new Promise((resolve) => {
    const res = {
      destroyed: false,
      writableEnded: false,
      writeHead(status) { this.status = status; },
      end(body) { this.writableEnded = true; resolve({ status: this.status, body: JSON.parse(body) }); },
    };
    middleware({ url: '/api/note-radar/goals' }, res, () => resolve({ status: 'forwarded' }));
  });
  for (let i = 0; i < 10; i += 1) {
    await delay(15);
    collectGarbage();
  }

  const { status, body } = await answered;
  assert.equal(status, 503);
  assert.equal(body.code, 'NOTE_RADAR_MOCK_UNAVAILABLE');
  assert.ok(Date.now() - started < 2000, 'the guard must answer within its own timeout, not after the 300 s fetch default');
});
