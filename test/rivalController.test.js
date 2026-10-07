import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createRivalController } from '../src/features/rivalCrawler/controller.js';

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

function harness(overrides = {}) {
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
