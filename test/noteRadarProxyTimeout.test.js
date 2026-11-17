import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteRadarMockProxyGuard } from '../scripts/note-radar-mock-proxy.mjs';

function guardMiddleware(target, timeoutMs) {
  let middleware;
  createNoteRadarMockProxyGuard({ target, timeoutMs })
    .configureServer({ middlewares: { use: (fn) => { middleware = fn; } } });
  return middleware;
}

// Calls the guard the way Vite would and resolves with what it answered.
function callGuard(middleware) {
  return new Promise((resolve) => {
    const res = {
      destroyed: false,
      writableEnded: false,
      writeHead(status) { this.status = status; },
      end(body) { this.writableEnded = true; resolve({ status: this.status, body: JSON.parse(body) }); },
    };
    middleware({ url: '/api/note-radar/goals' }, res, () => resolve({ status: 'forwarded' }));
  });
}

test('a stalled identity body is cut off at the deadline even when aborting the fetch does not reach the read', { timeout: 5000 }, async (t) => {
  // Once the identity headers have arrived, a garbage collection can leave fetch
  // unable to abort the pending body read; CI saw that as a 300 s stall. This
  // stand-in for fetch puts the guard in that state directly: valid identity
  // headers, then a body that never ends and ignores the abort signal.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream(), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Note-Radar-Mock': '1' },
  });
  t.after(() => { globalThis.fetch = realFetch; });

  const started = Date.now();
  const { status, body } = await callGuard(guardMiddleware('http://127.0.0.1:9', 200));

  assert.equal(status, 503);
  assert.equal(body.code, 'NOTE_RADAR_MOCK_UNAVAILABLE');
  assert.ok(Date.now() - started < 2000, 'the guard must answer within its own timeout, not after the 300 s fetch default');
});
