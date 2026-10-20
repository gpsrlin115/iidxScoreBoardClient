import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createRivalController } from '../src/features/rivalCrawler/controller.js';
import {
  classifyRivalError, isRequestActive, isRequestTerminal, normalizePlayStyles, partialMessage, requestJobs,
  requestKey, waitingReasonText,
} from '../src/utils/rivalCrawler.js';

// One request may hold an SP job and a DP job; the server returns them SP first in `jobs`.
const job = (id, playStyle, status, extra = {}) => ({ id, playStyle, status, pagesDone: 0, pagesTotal: 34, ...extra });
const statusOf = (jobs, extra = {}) => ({ enabled: true, cooldownUntil: null, latestJob: jobs[0] ?? null, jobs, ...extra });
const httpError = (status, data = {}, headers = {}) => ({ response: { status, data, headers } });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const drain = async () => { for (let i = 0; i < 5; i += 1) await tick(); };

test('requestJobs reads jobs when the server sends them, even empty, and falls back to latestJob only without the field', () => {
  const sp = job(1, 'SP', 'DONE');
  const dp = job(2, 'DP', 'RUNNING');
  assert.deepEqual(requestJobs({ latestJob: dp, jobs: [sp, dp] }), [sp, dp]);
  assert.deepEqual(requestJobs({ latestJob: null, jobs: [] }), []);
  // An empty array from the new server must not resurrect a stale latestJob.
  assert.deepEqual(requestJobs({ latestJob: sp, jobs: [] }), []);
  assert.deepEqual(requestJobs({ latestJob: sp }), [sp], 'older server: latestJob is the whole request');
  assert.deepEqual(requestJobs({ latestJob: null }), []);
  assert.deepEqual(requestJobs(null), []);
});

test('SP done while DP still runs is an active request, not a finished one', () => {
  const status = statusOf([job(1, 'SP', 'DONE'), job(2, 'DP', 'RUNNING')], { latestJob: job(2, 'DP', 'RUNNING') });
  assert.equal(isRequestActive(status), true);
  assert.equal(isRequestTerminal(status), false);
  const queued = statusOf([job(1, 'SP', 'DONE'), job(2, 'DP', 'QUEUED')]);
  assert.equal(isRequestActive(queued), true);
});

test('a request is terminal only when every job ended, and keyed by its job ids', () => {
  const done = statusOf([job(1, 'SP', 'DONE'), job(2, 'DP', 'PARTIAL')]);
  assert.equal(isRequestActive(done), false);
  assert.equal(isRequestTerminal(done), true);
  assert.equal(requestKey(done), '1,2');
  assert.equal(isRequestTerminal(statusOf([])), false, 'no jobs is not a finished request');
});

test('play styles are SP and/or DP, each once, SP first; anything else is refused', () => {
  assert.deepEqual(normalizePlayStyles(['SP', 'DP']), ['SP', 'DP']);
  assert.deepEqual(normalizePlayStyles(['DP', 'SP']), ['SP', 'DP']);
  assert.deepEqual(normalizePlayStyles(['DP']), ['DP']);
  for (const bad of [[], ['SP', 'SP'], ['sp'], ['SP', 'DP', 'DP'], ['DB'], 'SP', null, undefined]) {
    assert.equal(normalizePlayStyles(bad), null, JSON.stringify(bad));
  }
});

test('PARTIAL is told as a series count with the 60 minute resume, never the server sentence', () => {
  assert.equal(partialMessage({ status: 'PARTIAL', pagesDone: 12, pagesTotal: 34 }),
    '34개 시리즈 중 12개를 저장했습니다. 60분 뒤 다시 요청하면 남은 시리즈만 받습니다.');
  assert.match(partialMessage({ status: 'PARTIAL', pagesDone: null, pagesTotal: null }), /34개 시리즈 중 일부를 저장했습니다/);
  assert.doesNotMatch(partialMessage({ status: 'PARTIAL', pagesDone: 3, errorMessage: 'Rival collection stored 3 of 34 series (X).' }), /Rival/);
});

test('waiting reasons have Korean copy, and unknown codes are hidden instead of shown raw', () => {
  assert.match(waitingReasonText('LIST_REPEAT'), /e-amusement가 일부 목록을 늦게 보내 다시 확인하는 중/);
  assert.equal(waitingReasonText('SOMETHING_NEW'), null);
  assert.equal(waitingReasonText(null), null);
});

test('job 429 shows fixed copy with Retry-After, never the English body', () => {
  const info = classifyRivalError(httpError(429, { error: 'Too Many Requests', message: 'Rival collection is cooling down' },
    { 'retry-after': '1800' }), 'enqueue');
  assert.equal(info.retryAfterSeconds, 1800);
  assert.match(info.message, /요청 한도에 도달했습니다/);
  assert.doesNotMatch(info.message, /cooling|Too Many/);
});

test('the pre-launch edge block (503 + x-iidx-maintenance) reads as "not open yet", plain or AxiosHeaders', () => {
  const plain = classifyRivalError(httpError(503, '<html>maintenance</html>', { 'x-iidx-maintenance': 'crawler-validation' }), 'enqueue');
  assert.equal(plain.code, 'CRAWLER_VALIDATION');
  assert.match(plain.message, /아직 준비 중입니다/);
  const axiosLike = { get: (name) => (name === 'x-iidx-maintenance' ? 'crawler-validation' : undefined) };
  assert.equal(classifyRivalError(httpError(503, '', axiosLike), 'enqueue').code, 'CRAWLER_VALIDATION');
  // A plain 503 keeps the existing disabled copy.
  const disabled = classifyRivalError(httpError(503, { code: 'RIVAL_COLLECTION_DISABLED' }), 'enqueue');
  assert.equal(disabled.code, 'RIVAL_COLLECTION_DISABLED');
  assert.doesNotMatch(disabled.message, /아직 준비 중/);
});

test('a bad style answer on the job endpoint does not talk about cookies', () => {
  const info = classifyRivalError(httpError(400, { code: 'INVALID_VERIFICATION_INPUT' }), 'enqueue');
  assert.match(info.message, /플레이 스타일/);
  assert.doesNotMatch(info.message, /쿠키/);
});

// ---------------------------------------------------------------- controller

const linked = { iidxId: '1234-5678', verified: false, verifiedAt: null, registered: true, source: 'BOOKMARKLET', registeredAt: null };

function harness(statuses) {
  const calls = { getStatus: 0, enqueue: [], cancel: 0 };
  const queue = [...statuses];
  const timers = [];
  let terminals = 0;
  const api = {
    getStatus: () => { calls.getStatus += 1; return Promise.resolve(queue.length > 1 ? queue.shift() : queue[0]); },
    getBinding: () => Promise.resolve(linked),
    getRegistration: () => Promise.resolve(null),
    enqueue: (...args) => { calls.enqueue.push(args); return Promise.resolve(job(1, 'SP', 'QUEUED')); },
    cancel: () => { calls.cancel += 1; return Promise.resolve(job(1, 'SP', 'CANCELLED')); },
  };
  const controller = createRivalController({ api, interval: 10,
    onTerminal: () => { terminals += 1; },
    schedule: (callback, delay) => { const item = { callback, delay, cleared: false }; timers.push(item); return item; },
    unschedule: (item) => { if (item) item.cleared = true; } });
  const poll = async () => {
    const next = timers.filter((item) => !item.cleared).pop();
    assert.ok(next, 'a poll is scheduled');
    next.cleared = true;
    next.callback();
    await drain();
  };
  return { api, calls, controller, poll, terminalCount: () => terminals, timers };
}

test('polling continues while DP runs after SP finished, and "finished" is announced once when both end', async () => {
  const h = harness([
    statusOf([job(1, 'SP', 'RUNNING'), job(2, 'DP', 'QUEUED')]),
    statusOf([job(1, 'SP', 'DONE'), job(2, 'DP', 'RUNNING')]),
    statusOf([job(1, 'SP', 'DONE'), job(2, 'DP', 'DONE')]),
  ]);
  h.controller.start();
  await drain();
  await h.poll();
  assert.equal(h.terminalCount(), 0, 'SP DONE + DP RUNNING is not the end');
  assert.ok(h.timers.some((item) => !item.cleared), 'still polling for DP');
  await h.poll();
  assert.equal(h.terminalCount(), 1);
  // Re-reading the same finished request does not announce it again.
  await h.controller.refresh();
  await h.controller.refresh();
  assert.equal(h.terminalCount(), 1);
  assert.ok(!h.timers.some((item) => !item.cleared), 'polling stops once every job ended');
});

test('enqueue sends the chosen styles, then re-reads jobs; a bad selection sends nothing', async () => {
  const h = harness([
    statusOf([]),
    statusOf([job(1, 'SP', 'QUEUED'), job(2, 'DP', 'QUEUED')]),
  ]);
  h.controller.start();
  await drain();
  await h.controller.enqueue(['SP', 'SP']);
  await h.controller.enqueue(['DB']);
  assert.equal(h.calls.enqueue.length, 0, 'invalid selections never reach the API');
  await h.controller.enqueue(['SP', 'DP']);
  assert.equal(h.calls.enqueue.length, 1);
  assert.deepEqual(h.calls.enqueue[0][0], ['SP', 'DP']);
  const jobs = h.controller.getSnapshot().status.jobs;
  assert.deepEqual(jobs.map((item) => item.playStyle), ['SP', 'DP'], 'the full jobs list came from the follow-up GET');
  // The second job keeps the request locked.
  await h.controller.enqueue(['SP']);
  assert.equal(h.calls.enqueue.length, 1);
});

test('cancel is allowed while only DP is still running', async () => {
  const h = harness([statusOf([job(1, 'SP', 'DONE'), job(2, 'DP', 'RUNNING')])]);
  h.controller.start();
  await drain();
  await h.controller.cancel();
  assert.equal(h.calls.cancel, 1);
});

test('an older server without jobs still drives polling and the finished callback through latestJob', async () => {
  const h = harness([
    { enabled: true, cooldownUntil: null, latestJob: job(1, 'SP', 'RUNNING') },
    { enabled: true, cooldownUntil: null, latestJob: job(1, 'SP', 'DONE') },
  ]);
  h.controller.start();
  await drain();
  assert.ok(h.timers.some((item) => !item.cleared));
  await h.poll();
  assert.equal(h.terminalCount(), 1);
});
