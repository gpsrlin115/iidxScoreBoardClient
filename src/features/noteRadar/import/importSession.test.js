import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createImportSession } from './importSession.js';
import { ATTEMPT, payload } from './fixtures.test.js';
import { EAGATE_ORIGIN } from './protocol.js';
import { importError } from './importErrors.js';

const NOW = Date.parse('2026-10-18T00:00:00Z');
const pending = () => ({ status: 'PENDING', attemptId: ATTEMPT, expiresAt: '2026-10-18T00:05:00Z' });
const message = () => ({ type: 'IIDX_RADAR_DATA', version: 1, attemptId: ATTEMPT, payload: payload() });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup({ current = () => Promise.resolve(pending()), complete = () => Promise.resolve(), opener = undefined } = {}) {
  const timers = [];
  const handlers = new Set();
  const posted = [];
  const calls = [];
  const win = { opener: opener === undefined ? { closed: false, postMessage: (data, origin) => posted.push({ data, origin }) } : opener,
    addEventListener: (_name, fn) => handlers.add(fn), removeEventListener: (_name, fn) => handlers.delete(fn) };
  const session = createImportSession({ api: { current, complete: (...args) => { calls.push(args); return complete(...args); } }, win,
    now: () => NOW,
    schedule: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    unschedule: (timer) => { if (timer) timer.cleared = true; },
  });
  return { session, timers, handlers, posted, calls, phase: () => session.getSnapshot().phase,
    send: (data = message(), overrides = {}) => [...handlers].forEach((fn) => fn({ data, origin: EAGATE_ORIGIN, source: win.opener, ...overrides })) };
}

test('popup uses only existing expiring server attempt and reviews before one-shot completion', async () => {
  const h = setup();
  await h.session.start(); await h.session.start();
  assert.deepEqual(h.posted, [{ data: { type: 'IIDX_RADAR_READY', version: 1, attemptId: ATTEMPT }, origin: EAGATE_ORIGIN }]);
  h.send(message(), { origin: 'https://evil.example' }); h.send(message(), { source: {} });
  h.send({ ...message(), attemptId: '87654321-1234-4234-8234-123456789abc' });
  assert.equal(h.phase(), 'waiting');
  h.send(); h.send();
  assert.equal(h.phase(), 'reviewing'); assert.equal(h.calls.length, 0);
  await Promise.all([h.session.confirm(), h.session.confirm()]);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], ATTEMPT);
  assert.equal(h.phase(), 'done'); assert.equal(h.session.getSnapshot().payload, null);
});

test('no opener, absent attempts, malformed nonce, and expired attempts never send READY', async () => {
  const cases = [setup({ opener: null }), setup({ opener: { closed: true } }), setup({ current: () => Promise.resolve({ status: 'NONE' }) }),
    setup({ current: () => Promise.resolve({ ...pending(), attemptId: 'x' }) }),
    setup({ current: () => Promise.resolve({ ...pending(), expiresAt: '2020-01-01T00:00:00Z' }) })];
  for (const h of cases) { await h.session.start(); assert.equal(h.posted.length, 0); assert.equal(h.calls.length, 0); }
});

test('every hung read and completion has a separate settling deadline even if abort is ignored', async () => {
  const start = setup({ current: () => new Promise(() => {}) });
  const starting = start.session.start(); await tick();
  start.timers[0].callback(); await starting;
  assert.equal(start.phase(), 'failed');
  let reads = 0;
  const h = setup({ current: () => ++reads === 1 ? Promise.resolve(pending()) : new Promise(() => {}), complete: () => new Promise(() => {}) });
  await h.session.start(); h.send();
  const confirming = h.session.confirm(); await tick();
  h.timers.find((timer) => timer.delay === 20000).callback(); await tick();
  h.timers.filter((timer) => timer.delay === 10000 && !timer.cleared).forEach((timer) => timer.callback());
  await confirming;
  assert.equal(h.phase(), 'failed'); assert.equal(h.calls.length, 1);
});

test('lost completion response is reconciled with a separate GET and never retried', async () => {
  let reads = 0;
  const h = setup({ current: () => Promise.resolve(++reads === 1 ? pending() : { ...pending(), status: 'COMPLETED' }),
    complete: () => Promise.reject(new Error('lost')) });
  await h.session.start(); h.send(); await h.session.confirm(); await h.session.confirm();
  assert.equal(h.phase(), 'done'); assert.equal(h.calls.length, 1); assert.equal(reads, 2);
});

test('disposing while waiting removes messages and clears in-memory records', async () => {
  const h = setup(); await h.session.start(); h.send(); h.session.dispose();
  await h.session.confirm(); assert.equal(h.calls.length, 0); assert.equal(h.handlers.size, 0);
  assert.equal(h.session.getSnapshot().payload, null);
});

test('known backend refusals explain account binding, incomplete input, expiry, and login', () => {
  assert.match(importError({ code: 'IIDX_ACCOUNT_MISMATCH', status: 409 }), /코드가.*다릅니다/);
  assert.match(importError({ code: 'IIDX_LINK_REQUIRED', status: 409 }), /연결/);
  assert.match(importError({ code: 'INVALID_RADAR_INPUT', status: 400 }), /여섯 카테고리/);
  assert.match(importError({ code: 'RADAR_ATTEMPT_EXPIRED', status: 409 }), /만료/);
  assert.match(importError({ code: 'SITE_LOGIN_REQUIRED', status: 401 }), /로그인/);
});
