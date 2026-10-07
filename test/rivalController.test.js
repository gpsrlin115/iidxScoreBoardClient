import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createRivalController } from '../src/features/rivalCrawler/controller.js';
import { EMPTY_BINDING } from '../src/utils/rivalCrawler.js';

const verifiedBinding = { iidxId: '1234-5678', verified: true, verifiedAt: '2026-10-06T10:00:00' };
const emptyBinding = { iidxId: null, verified: false, verifiedAt: null };
const idleStatus = { enabled: true, latestJob: null, cooldownUntil: null };
const activeJob = (overrides = {}) => ({ id: 7, status: 'QUEUED', pagesTotal: null, pagesDone: 0,
  requestsEstimated: null, requestsDone: 0, progressPercent: null, estimatedStartAt: null,
  estimatedFinishAt: null, nextRequestAt: null, waitingReason: null, ...overrides });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const drain = async () => { for (let i = 0; i < 4; i += 1) await tick(); };

function harness(overrides = {}, options = {}) {
  const calls = { getStatus: [], getBinding: [], verify: [], enqueue: [], cancel: [], unlink: [] };
  const api = {
    getStatus: (...args) => { calls.getStatus.push(args); return Promise.resolve(idleStatus); },
    getBinding: (...args) => { calls.getBinding.push(args); return Promise.resolve(emptyBinding); },
    verify: (...args) => { calls.verify.push(args); return Promise.resolve(verifiedBinding); },
    enqueue: (...args) => { calls.enqueue.push(args); return Promise.resolve(activeJob()); },
    cancel: (...args) => { calls.cancel.push(args); return Promise.resolve(activeJob({ status: 'CANCELLED' })); },
    unlink: (...args) => { calls.unlink.push(args); return Promise.resolve(undefined); },
    ...overrides,
  };
  const timers = [];
  const controller = createRivalController({ api, interval: 10,
    schedule: (callback, delay) => { const item = { callback, delay, cleared: false }; timers.push(item); return item; },
    unschedule: (item) => { if (item) item.cleared = true; },
    ...options,
  });
  return { api, calls, timers, controller };
}

async function readyUnverified(h) {
  h.controller.start();
  await drain();
  assert.equal(h.controller.getSnapshot().ready, true);
  assert.equal(h.controller.getSnapshot().binding.verified, false);
}

async function readyVerified(h) {
  h.controller.start();
  await drain();
  h.api.getBinding = async (...args) => { h.calls.getBinding.push(args); return verifiedBinding; };
  await h.controller.refresh();
  assert.equal(h.controller.getSnapshot().binding.verified, true);
}

test('unverified user verifies their own ID and enqueues without credentials', async () => {
  const h = harness();
  await readyUnverified(h);
  h.api.getBinding = async (...args) => { h.calls.getBinding.push(args); return verifiedBinding; };
  await h.controller.verify('secret-session');
  assert.equal(h.calls.verify.length, 1);
  assert.equal(h.calls.verify[0][0], 'secret-session');
  assert.equal(h.controller.getSnapshot().binding.iidxId, '1234-5678');
  assert.equal(h.controller.getSnapshot().binding.verified, true);
  h.api.getStatus = async (...args) => { h.calls.getStatus.push(args); return { ...idleStatus, latestJob: activeJob() }; };
  await h.controller.enqueue();
  assert.equal(h.calls.enqueue.length, 1);
  assert.equal(h.calls.enqueue[0].length, 1);
  assert.ok(h.calls.enqueue[0][0].signal instanceof AbortSignal);
  assert.equal(h.controller.getSnapshot().status.latestJob.status, 'QUEUED');
});

test('synchronous duplicate actions are locked and active jobs block verify and enqueue', async () => {
  const pendingVerify = deferred();
  const h = harness({ verify: (...args) => { h.calls.verify.push(args); return pendingVerify.promise; } });
  await readyUnverified(h);
  const first = h.controller.verify('cookie');
  const duplicate = h.controller.verify('cookie-again');
  await h.controller.enqueue();
  assert.equal(h.calls.verify.length, 1);
  assert.equal(h.calls.enqueue.length, 0);
  pendingVerify.resolve(verifiedBinding);
  await Promise.all([first, duplicate]);

  h.api.getStatus = async (...args) => { h.calls.getStatus.push(args); return { ...idleStatus, latestJob: activeJob({ status: 'RUNNING' }) }; };
  await h.controller.refresh();
  await h.controller.verify('blocked');
  await h.controller.enqueue();
  assert.equal(h.calls.verify.length, 1);
  assert.equal(h.calls.enqueue.length, 0);
});

test('unlink supersedes a late verification response and stale response cannot restore binding', async () => {
  const verifyResult = deferred();
  const unlinkResult = deferred();
  const h = harness({
    verify: (...args) => { h.calls.verify.push(args); return verifyResult.promise; },
    unlink: (...args) => { h.calls.unlink.push(args); return unlinkResult.promise; },
  });
  await readyUnverified(h);
  const verification = h.controller.verify('cookie');
  const unlinking = h.controller.unlink();
  assert.equal(h.calls.unlink.length, 1);
  assert.equal(h.calls.verify[0][1].signal.aborted, true);
  verifyResult.resolve(verifiedBinding);
  await drain();
  assert.equal(h.controller.getSnapshot().binding.verified, false);
  unlinkResult.resolve();
  await Promise.all([verification, unlinking]);
  assert.equal(h.controller.getSnapshot().binding.verified, false);
});

test('dispose ignores late read results and emits no result callback after disposal', async () => {
  const result = deferred();
  let terminalCalls = 0;
  const h = harness({ getStatus: (...args) => { h.calls.getStatus.push(args); return result.promise; } });
  const controller = createRivalController({ api: h.api, onTerminal: () => { terminalCalls += 1; } });
  let notifications = 0;
  controller.subscribe(() => { notifications += 1; });
  controller.start();
  await drain();
  controller.dispose();
  const afterDispose = notifications;
  result.resolve({ ...idleStatus, latestJob: activeJob({ status: 'DONE' }) });
  await drain();
  assert.equal(notifications, afterDispose);
  assert.equal(terminalCalls, 0);
  assert.equal(controller.getSnapshot().status, null);
});

test('polling uses GET only, never overlaps slow reads, and stops after a terminal result', async () => {
  const slow = deferred();
  let gets = 0;
  let outstanding = 0;
  let maximumOutstanding = 0;
  const h = harness({ getStatus: (...args) => {
    h.calls.getStatus.push(args);
    gets += 1;
    outstanding += 1;
    maximumOutstanding = Math.max(maximumOutstanding, outstanding);
    return slow.promise.finally(() => { outstanding -= 1; });
  } });
  h.api.getBinding = async (...args) => { h.calls.getBinding.push(args); return emptyBinding; };
  h.controller.start();
  await drain();
  assert.equal(gets, 1);
  assert.equal(h.timers.filter((timer) => !timer.cleared).length, 0);
  void h.controller.refresh(false);
  assert.equal(gets, 1);
  slow.resolve({ ...idleStatus, latestJob: activeJob({ status: 'RUNNING' }) });
  await drain();
  assert.equal(maximumOutstanding, 1);
  const poll = h.timers.filter((timer) => !timer.cleared).at(-1);
  assert.ok(poll);
  const terminal = deferred();
  h.api.getStatus = (...args) => { h.calls.getStatus.push(args); return terminal.promise; };
  poll.callback();
  await drain();
  terminal.resolve({ ...idleStatus, latestJob: activeJob({ status: 'DONE' }) });
  await drain();
  assert.equal(h.controller.getSnapshot().status.latestJob.status, 'DONE');
  assert.equal(h.timers.filter((timer) => !timer.cleared).length, 0);
  assert.equal(h.calls.enqueue.length, 0);
  assert.equal(h.calls.cancel.length, 0);
});

test('StrictMode start-dispose-start gets a fresh read after the stale request settles', async () => {
  const first = deferred();
  let count = 0;
  const h = harness({ getStatus: (...args) => {
    h.calls.getStatus.push(args);
    count += 1;
    return count === 1 ? first.promise : Promise.resolve(idleStatus);
  } });
  h.controller.start();
  await drain();
  h.controller.dispose();
  h.controller.start();
  first.resolve({ ...idleStatus, latestJob: activeJob({ status: 'DONE' }) });
  await drain();
  assert.equal(count, 2);
  assert.equal(h.controller.getSnapshot().ready, true);
  assert.equal(h.controller.getSnapshot().status.latestJob, null);
});

test('nullable progress stays null and 34 pages or 38 requests do not complete a RUNNING job', async () => {
  const job = activeJob({ status: 'RUNNING', pagesTotal: 34, pagesDone: 34,
    requestsEstimated: 38, requestsDone: 38, progressPercent: null,
    estimatedStartAt: null, estimatedFinishAt: null, nextRequestAt: null, waitingReason: null });
  const h = harness({ getStatus: async (...args) => { h.calls.getStatus.push(args); return { ...idleStatus, latestJob: job }; } });
  await readyUnverified(h);
  const current = h.controller.getSnapshot().status.latestJob;
  assert.equal(current.status, 'RUNNING');
  assert.equal(current.progressPercent, null);
  assert.equal(current.estimatedFinishAt, null);
  assert.equal(h.timers.filter((timer) => !timer.cleared).length, 1);
});

test('each terminal state triggers one cache callback and refreshes the binding', async () => {
  let job = null;
  let invalidations = 0;
  let bindingReads = 0;
  const h = harness({ getStatus: async (...args) => { h.calls.getStatus.push(args); return { ...idleStatus, latestJob: job }; },
    getBinding: async (...args) => { h.calls.getBinding.push(args); bindingReads += 1; return verifiedBinding; } });
  const controller = createRivalController({ api: h.api, onTerminal: () => { invalidations += 1; } });
  controller.start();
  await drain();
  for (const [index, status] of ['DONE', 'PARTIAL', 'FAILED', 'CANCELLED'].entries()) {
    job = activeJob({ id: index + 1, status });
    await controller.refresh();
    assert.equal(invalidations, index + 1);
  }
  assert.equal(bindingReads, 5);
  assert.equal(controller.getSnapshot().binding.verified, true);
  controller.dispose();
});

test('cancel 404 re-reads current job state and does not retry the mutation', async () => {
  let cancelCount = 0;
  let statusReads = 0;
  const h = harness({
    getStatus: async (...args) => { h.calls.getStatus.push(args); statusReads += 1; return { ...idleStatus, latestJob: activeJob({ status: statusReads === 1 ? 'RUNNING' : 'DONE' }) }; },
    getBinding: async (...args) => { h.calls.getBinding.push(args); return verifiedBinding; },
    cancel: async (...args) => { h.calls.cancel.push(args); cancelCount += 1; const error = new Error(); error.response = { status: 404, data: {} }; throw error; },
  });
  h.controller.start();
  await drain();
  await h.controller.cancel();
  assert.equal(cancelCount, 1);
  assert.ok(h.calls.getStatus.length >= 2);
  assert.equal(h.controller.getSnapshot().status.latestJob.status, 'DONE');
  assert.match(h.controller.getSnapshot().error.message, /다시 조회/);
});

test('disabled and missing status endpoints never admit enqueue', async () => {
  const disabled = harness({ getStatus: async (...args) => { disabled.calls.getStatus.push(args); return { ...idleStatus, enabled: false }; },
    getBinding: async (...args) => { disabled.calls.getBinding.push(args); return verifiedBinding; } });
  await readyVerified(disabled);
  await disabled.controller.refresh();
  await disabled.controller.enqueue();
  assert.equal(disabled.calls.enqueue.length, 0);

  const missing = harness({ getStatus: async (...args) => { missing.calls.getStatus.push(args); const error = new Error(); error.response = { status: 404, data: {} }; throw error; } });
  missing.controller.start();
  await drain();
  assert.equal(missing.controller.getSnapshot().ready, false);
  await missing.controller.enqueue();
  assert.equal(missing.calls.enqueue.length, 0);
});

test('mutation failures are not automatically retried', async () => {
  let verifyCalls = 0;
  const h = harness({ verify: async (...args) => { h.calls.verify.push(args); verifyCalls += 1; const error = new Error(); error.response = { status: 502, data: {} }; throw error; } });
  await readyUnverified(h);
  await h.controller.verify('cookie');
  assert.equal(verifyCalls, 1);
  assert.equal(h.controller.getSnapshot().error.status, 502);
  assert.ok(h.calls.getStatus.length >= 2);
});

test('429 with Retry-After blocks a duplicate verify until its supplied timer expires', async () => {
  let calls = 0;
  const h = harness({ verify: async (...args) => {
    h.calls.verify.push(args);
    calls += 1;
    const error = new Error();
    error.response = { status: 429, data: {}, headers: { 'retry-after': '3' } };
    throw error;
  } });
  await readyUnverified(h);
  await h.controller.verify('first-cookie');
  assert.equal(calls, 1);
  assert.equal(h.controller.getSnapshot().retryBlockedAction, 'verify');
  assert.ok(h.timers.some((timer) => !timer.cleared && timer.delay === 3000));
  await h.controller.verify('duplicate-cookie');
  assert.equal(calls, 1);

  h.api.verify = async (...args) => { h.calls.verify.push(args); calls += 1; return verifiedBinding; };
  const retry = h.timers.find((timer) => !timer.cleared && timer.delay === 3000);
  retry.callback();
  assert.equal(h.controller.getSnapshot().retryBlockedAction, null);
  await h.controller.verify('after-window-cookie');
  assert.equal(calls, 2);
});

test('429 without Retry-After does not invent a retry time or block a manual attempt', async () => {
  let calls = 0;
  const h = harness({ verify: async (...args) => {
    h.calls.verify.push(args);
    calls += 1;
    const error = new Error();
    error.response = { status: 429, data: {}, headers: {} };
    throw error;
  } });
  await readyUnverified(h);
  await h.controller.verify('cookie');
  assert.equal(h.controller.getSnapshot().retryBlockedAction, null);
  assert.equal(h.timers.some((timer) => !timer.cleared && timer.delay === 3000), false);
  assert.equal(h.controller.getSnapshot().error.retryAfterSeconds, null);
  await h.controller.verify('manual-retry');
  assert.equal(calls, 2);
});

test('server cooldown blocks enqueue without parsing a local or offsetless clock', async () => {
  const h = harness({ getStatus: async (...args) => {
    h.calls.getStatus.push(args);
    return { ...idleStatus, cooldownUntil: '2026-10-06T00:00:00' };
  }, getBinding: async (...args) => { h.calls.getBinding.push(args); return verifiedBinding; } });
  await readyVerified(h);
  await h.controller.enqueue();
  assert.equal(h.calls.enqueue.length, 0);
  assert.equal(h.controller.getSnapshot().status.cooldownUntil, '2026-10-06T00:00:00');
});

test('dispose during verification ignores a late success', async () => {
  const result = deferred();
  let terminalCalls = 0;
  const h = harness({ verify: (...args) => { h.calls.verify.push(args); return result.promise; } });
  const controller = createRivalController({ api: h.api, onTerminal: () => { terminalCalls += 1; } });
  controller.start();
  await drain();
  const verifying = controller.verify('cookie');
  controller.dispose();
  result.resolve(verifiedBinding);
  await verifying;
  assert.equal(controller.getSnapshot().binding, null);
  assert.equal(controller.getSnapshot().action, null);
  assert.equal(terminalCalls, 0);
});

test('unlink of an active job clears binding and observes server CANCELLED for invalidation', async () => {
  let invalidations = 0;
  const h = harness({
    getStatus: async (...args) => { h.calls.getStatus.push(args); return { ...idleStatus, latestJob: activeJob({ status: 'CANCELLED' }) }; },
    getBinding: async (...args) => { h.calls.getBinding.push(args); return emptyBinding; },
  });
  const controller = createRivalController({ api: h.api, onTerminal: () => { invalidations += 1; } });
  controller.start();
  await drain();
  assert.equal(controller.getSnapshot().binding.verified, false);
  await controller.unlink();
  assert.equal(h.calls.unlink.length, 1);
  assert.deepEqual(controller.getSnapshot().binding, emptyBinding);
  assert.equal(controller.getSnapshot().status.latestJob.status, 'CANCELLED');
  assert.equal(invalidations, 1);
});

test('observed terminal state invalidates caches even when binding refresh fails', async () => {
  let invalidations = 0;
  const h = harness({
    getStatus: async (...args) => { h.calls.getStatus.push(args); return { ...idleStatus, latestJob: activeJob({ id: 91, status: 'DONE' }) }; },
    getBinding: async (...args) => { h.calls.getBinding.push(args); throw new Error('binding read failed'); },
  });
  const controller = createRivalController({ api: h.api, onTerminal: () => { invalidations += 1; } });
  controller.start();
  await drain();
  assert.equal(invalidations, 1);
  assert.equal(controller.getSnapshot().status.latestJob.status, 'DONE');
  assert.equal(controller.getSnapshot().ready, false);
  controller.dispose();
});

// --- Bookmarklet registration -------------------------------------------------

const NOW = Date.parse('2026-10-06T02:00:00Z');
const RETRY_AT = '2026-10-06T02:30:00Z';
const ATTEMPT_ID = '3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';
const registeredBinding = { iidxId: '1234-5678', verified: false, verifiedAt: null, registered: true,
  source: 'BOOKMARKLET', registeredAt: '2026-10-06T02:04:05Z' };
const pendingBinding = { iidxId: null, verified: false, verifiedAt: null, registered: false, source: null, registeredAt: null };
const noAttempt = () => ({ status: 'NONE', attemptId: null, retryAt: null });
const pendingAttempt = () => ({ status: 'PENDING', attemptId: ATTEMPT_ID, expiresAt: '2026-10-06T02:05:00Z', retryAt: null });
const httpFailure = (status, data = {}, headers = {}) => Object.assign(new Error(`http ${status}`), { response: { status, data, headers } });

/** `h.registration` is what GET /bookmarklet/me answers next; `clock.t` is the controller's now(). */
function regHarness(overrides = {}, clock = { t: NOW }) {
  const h = harness({}, { now: () => clock.t });
  h.clock = clock;
  h.registration = noAttempt();
  Object.assign(h.calls, { getRegistration: [], startRegistration: [], cancelRegistration: [] });
  Object.assign(h.api, {
    getRegistration: (...args) => { h.calls.getRegistration.push(args); return Promise.resolve(h.registration); },
    startRegistration: (...args) => { h.calls.startRegistration.push(args); h.registration = pendingAttempt(); return Promise.resolve(pendingAttempt()); },
    cancelRegistration: (...args) => { h.calls.cancelRegistration.push(args); h.registration = noAttempt(); return Promise.resolve(undefined); },
    ...overrides,
  });
  return h;
}
const liveTimers = (h, delay) => h.timers.filter((timer) => !timer.cleared && timer.delay === delay);

test('a REGISTERED bookmarklet binding may enqueue and never needs the cookie verify', async () => {
  const h = regHarness({ getBinding: async (...args) => { h.calls.getBinding.push(args); return registeredBinding; } });
  h.controller.start();
  await drain();
  assert.equal(h.controller.getSnapshot().ready, true);
  assert.equal(h.controller.getSnapshot().registration, null, 'a linked account skips the registration GET');
  assert.equal(h.calls.getRegistration.length, 0);
  await h.controller.verify('synthetic-cookie');
  assert.equal(h.calls.verify.length, 0);
  await h.controller.enqueue();
  assert.equal(h.calls.enqueue.length, 1);
});

test('PENDING and REVOKED bindings carry no ID, so enqueue is never called for them', async () => {
  for (const binding of [pendingBinding, { ...EMPTY_BINDING }]) {
    const h = regHarness({ getBinding: async (...args) => { h.calls.getBinding.push(args); return binding; } });
    h.controller.start();
    await drain();
    assert.equal(h.controller.getSnapshot().ready, true);
    await h.controller.enqueue();
    assert.equal(h.calls.enqueue.length, 0);
  }
});

test('a verified binding from an older server without the registered field can still enqueue', async () => {
  const h = regHarness({ getBinding: async (...args) => { h.calls.getBinding.push(args); return verifiedBinding; } });
  assert.equal('registered' in verifiedBinding, false);
  h.controller.start();
  await drain();
  await h.controller.enqueue();
  assert.equal(h.calls.enqueue.length, 1);
  assert.equal(h.calls.verify.length, 0);
});

test('starting a registration needs an explicit user action and start() or refresh() never calls it', async () => {
  const h = regHarness();
  h.controller.start();
  await drain();
  await h.controller.refresh(true);
  await h.controller.refresh(false);
  assert.ok(h.calls.getRegistration.length >= 1, 'the registration is read with GET');
  assert.equal(h.calls.startRegistration.length, 0);
  assert.equal(h.controller.getSnapshot().registration.status, 'NONE');
  await h.controller.startRegistration();
  assert.equal(h.calls.startRegistration.length, 1);
  assert.equal(h.calls.startRegistration[0].length, 1);
  assert.ok(h.calls.startRegistration[0][0].signal instanceof AbortSignal);
  assert.equal(h.controller.getSnapshot().registration.attemptId, ATTEMPT_ID);
});

test('registration start is refused for a linked account, an active job, a disabled feature, or a stale screen', async () => {
  const linked = regHarness({ getBinding: async () => registeredBinding });
  const active = regHarness({ getStatus: async () => ({ ...idleStatus, latestJob: activeJob({ status: 'RUNNING' }) }) });
  const disabled = regHarness({ getStatus: async () => ({ ...idleStatus, enabled: false }) });
  const notReady = regHarness({ getStatus: async () => { throw httpFailure(502); } });
  for (const h of [linked, active, disabled, notReady]) {
    h.controller.start();
    await drain();
    await h.controller.startRegistration();
    assert.equal(h.calls.startRegistration.length, 0);
  }
  assert.equal(notReady.controller.getSnapshot().ready, false);
});

test('start 429 with a body retryAt blocks further starts until that instant and never blocks verify', async () => {
  const h = regHarness({ startRegistration: async (...args) => {
    h.calls.startRegistration.push(args);
    throw httpFailure(429, { code: 'REGISTRATION_RATE_LIMIT', message: 'RAW', retryAt: RETRY_AT });
  } });
  h.controller.start();
  await drain();
  await h.controller.startRegistration();
  const until = Date.parse(RETRY_AT);
  assert.equal(h.calls.startRegistration.length, 1);
  assert.equal(h.controller.getSnapshot().registrationBlockedUntil, until);
  assert.equal(h.controller.getSnapshot().error.code, 'REGISTRATION_RATE_LIMIT');
  assert.equal(h.controller.getSnapshot().error.retryAt, until);
  assert.equal(h.controller.getSnapshot().retryBlockedAction, null, 'the start limit has its own field');
  assert.equal(liveTimers(h, until - NOW).length, 1);

  await h.controller.startRegistration();
  assert.equal(h.calls.startRegistration.length, 1, 'blocked starts do not reach the API');
  await h.controller.verify('synthetic-cookie');
  assert.equal(h.calls.verify.length, 1, 'the hourly start limit is not a verify limit');

  h.api.startRegistration = async (...args) => { h.calls.startRegistration.push(args); h.registration = pendingAttempt(); return pendingAttempt(); };
  liveTimers(h, until - NOW)[0].callback();
  assert.equal(h.controller.getSnapshot().registrationBlockedUntil, null);
  await h.controller.startRegistration();
  assert.equal(h.calls.startRegistration.length, 2);
  h.controller.dispose();
});

test('start 429 with only Retry-After seconds blocks from now, and without either it blocks nothing', async () => {
  const header = regHarness({ startRegistration: async (...args) => {
    header.calls.startRegistration.push(args);
    throw httpFailure(429, { code: 'REGISTRATION_RATE_LIMIT' }, { 'retry-after': '120' });
  } });
  header.controller.start();
  await drain();
  await header.controller.startRegistration();
  assert.equal(header.controller.getSnapshot().registrationBlockedUntil, NOW + 120000);
  assert.equal(liveTimers(header, 120000).length, 1);

  const bare = regHarness({ startRegistration: async (...args) => { bare.calls.startRegistration.push(args); throw httpFailure(429, {}); } });
  bare.controller.start();
  await drain();
  await bare.controller.startRegistration();
  assert.equal(bare.controller.getSnapshot().registrationBlockedUntil, null);
  await bare.controller.startRegistration();
  assert.equal(bare.calls.startRegistration.length, 2);
});

test('a future retryAt in the GET registration blocks the start, and a past one does not', async () => {
  const blocked = regHarness();
  blocked.registration = { ...noAttempt(), retryAt: RETRY_AT };
  blocked.controller.start();
  await drain();
  assert.equal(blocked.controller.getSnapshot().registrationBlockedUntil, Date.parse(RETRY_AT));
  assert.equal(liveTimers(blocked, Date.parse(RETRY_AT) - NOW).length, 1);
  await blocked.controller.startRegistration();
  assert.equal(blocked.calls.startRegistration.length, 0);
  blocked.controller.dispose();
  assert.equal(liveTimers(blocked, Date.parse(RETRY_AT) - NOW).length, 0, 'dispose clears the unblock timer');

  const expired = regHarness();
  expired.registration = { ...noAttempt(), retryAt: '2026-10-06T01:00:00Z' };
  expired.controller.start();
  await drain();
  assert.equal(expired.controller.getSnapshot().registrationBlockedUntil, null);
  await expired.controller.startRegistration();
  assert.equal(expired.calls.startRegistration.length, 1);
});

test('cancelRegistration sends the PENDING attemptId and is skipped when nothing is pending', async () => {
  const idle = regHarness();
  idle.controller.start();
  await drain();
  await idle.controller.cancelRegistration();
  assert.equal(idle.calls.cancelRegistration.length, 0);

  const h = regHarness();
  h.registration = pendingAttempt();
  h.controller.start();
  await drain();
  assert.equal(h.controller.getSnapshot().registration.attemptId, ATTEMPT_ID);
  await h.controller.cancelRegistration();
  assert.equal(h.calls.cancelRegistration.length, 1);
  assert.equal(h.calls.cancelRegistration[0][0], ATTEMPT_ID);
  assert.ok(h.calls.cancelRegistration[0][1].signal instanceof AbortSignal);
  assert.equal(h.controller.getSnapshot().registration.status, 'NONE');
});

test('unlink leaves exactly EMPTY_BINDING, drops the old attempt, and re-opens registration', async () => {
  let unlinked = false;
  const h = regHarness({
    getBinding: async (...args) => { h.calls.getBinding.push(args); return unlinked ? { ...EMPTY_BINDING } : registeredBinding; },
    unlink: async (...args) => { h.calls.unlink.push(args); unlinked = true; },
  });
  const seen = [];
  h.controller.subscribe(() => seen.push(h.controller.getSnapshot()));
  h.controller.start();
  await drain();
  assert.equal(h.controller.getSnapshot().binding.registered, true);
  await h.controller.unlink();
  assert.equal(h.calls.unlink.length, 1);
  assert.deepEqual(h.controller.getSnapshot().binding, EMPTY_BINDING);
  const direct = seen.find((snapshot) => snapshot.action === 'unlink' && snapshot.ready === false && snapshot.registration === null);
  assert.ok(direct, 'the controller itself sets the binding to the empty shape before re-reading');
  assert.deepEqual(direct.binding, EMPTY_BINDING);
  assert.equal(h.controller.getSnapshot().registration.status, 'NONE');
  await h.controller.startRegistration();
  assert.equal(h.calls.startRegistration.length, 1);
});

test('a missing registration API (404) does not make the collection card unusable', async () => {
  const h = regHarness({ getRegistration: async (...args) => { h.calls.getRegistration.push(args); throw httpFailure(404); } });
  h.controller.start();
  await drain();
  const snapshot = h.controller.getSnapshot();
  assert.equal(h.calls.getRegistration.length, 1);
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.error, null);
  assert.equal(snapshot.registration, null);
  assert.equal(snapshot.registrationBlockedUntil, null);
});
