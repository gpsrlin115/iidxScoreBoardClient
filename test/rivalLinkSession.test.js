import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createLinkSession } from '../src/features/rivalCrawler/linkSession.js';
import { EMPTY_BINDING } from '../src/utils/rivalCrawler.js';

const EAGATE = 'https://p.eagate.573.jp';
const ATTEMPT_ID = '3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';
const RUN_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const pending = () => ({ status: 'PENDING', attemptId: ATTEMPT_ID, expiresAt: '2026-10-06T02:05:00Z', retryAt: null });
const registeredBinding = (iidxId = '1234-5678') => ({ iidxId, verified: false, verifiedAt: null, registered: true,
  source: 'BOOKMARKLET', registeredAt: '2026-10-06T02:04:05Z' });
const idleStatus = { enabled: true, latestJob: null, cooldownUntil: null };
const profile = (overrides = {}) => ({ type: 'IIDX_LINK_PROFILE', version: 1, runId: RUN_ID, iidxId: '1234-5678', ...overrides });
const httpFailure = (status, data = {}) => Object.assign(new Error(`http ${status}`), { response: { status, data, headers: {} } });
const lostResponse = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const drain = async () => { for (let i = 0; i < 5; i += 1) await tick(); };

/**
 * `registrations` is the queue of GET answers (the last one repeats);
 * `binding` is what GET /crawler/iidx/me answers.
 */
function setup({ registrations = [pending()], binding = { ...EMPTY_BINDING }, complete, opener } = {}) {
  const calls = { getRegistration: [], getBinding: [], getStatus: [], completeRegistration: [], startRegistration: [] };
  const posted = [];
  const messageListeners = new Set();
  const timers = [];
  const popupOpener = opener === undefined
    ? { closed: false, postMessage: (data, targetOrigin) => posted.push({ data, targetOrigin }) }
    : opener;
  const win = {
    opener: popupOpener,
    addEventListener: (type, fn) => { if (type === 'message') messageListeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'message') messageListeners.delete(fn); },
  };
  const h = { calls, posted, timers, win, opener: popupOpener, messageListeners, binding, registrations: [...registrations] };
  const api = {
    getRegistration: (...args) => {
      calls.getRegistration.push(args);
      const next = h.registrations.length > 1 ? h.registrations.shift() : h.registrations[0];
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    getBinding: (...args) => { calls.getBinding.push(args); return Promise.resolve(h.binding); },
    getStatus: (...args) => { calls.getStatus.push(args); return Promise.resolve(idleStatus); },
    completeRegistration: (...args) => {
      calls.completeRegistration.push(args);
      return complete ? complete(...args) : Promise.resolve(registeredBinding());
    },
    // The popup must never start an attempt; the original screen does that on a click.
    startRegistration: (...args) => { calls.startRegistration.push(args); throw new Error('the popup must not start a registration'); },
  };
  h.session = createLinkSession({ api, win,
    schedule: (callback, delay) => { const timer = { callback, delay, cleared: false }; timers.push(timer); return timer; },
    unschedule: (timer) => { if (timer) timer.cleared = true; } });
  h.handler = () => [...messageListeners][0];
  h.phase = () => h.session.getSnapshot().phase;
  h.message = (data, overrides = {}) => ({ origin: EAGATE, source: popupOpener, data, ...overrides });
  h.send = (data, overrides) => { [...messageListeners].forEach((fn) => fn(h.message(data, overrides))); };
  h.noStart = () => assert.equal(calls.startRegistration.length, 0, 'the popup never calls startRegistration');
  return h;
}

test('the popup reads the attempt with GET, sends one exact READY to eagate, and never starts a registration', async () => {
  const h = setup();
  await h.session.start();
  assert.equal(h.phase(), 'waiting');
  assert.equal(h.calls.getRegistration.length, 1);
  assert.equal(h.posted.length, 1);
  assert.deepEqual(h.posted[0].data, { type: 'IIDX_LINK_READY', version: 1 });
  assert.equal(h.posted[0].targetOrigin, 'https://p.eagate.573.jp');
  assert.equal(h.messageListeners.size, 1);
  assert.deepEqual(h.timers.map((timer) => timer.delay), [10000], 'one PROFILE wait timer');
  await h.session.start();
  assert.equal(h.calls.getRegistration.length, 1, 'start is idempotent');
  assert.equal(h.posted.length, 1);
  h.noStart();
});

test('without a PENDING attempt the popup stays silent: no READY, no listener, no start', async () => {
  const cases = [
    [{ status: 'NONE' }, { ...EMPTY_BINDING }, 'not-pending'],
    [{ status: 'EXPIRED', attemptId: ATTEMPT_ID }, { ...EMPTY_BINDING }, 'not-pending'],
    [{ status: 'PENDING', attemptId: 'not-a-uuid' }, { ...EMPTY_BINDING }, 'not-pending'],
    [{ status: 'PENDING', attemptId: null }, { ...EMPTY_BINDING }, 'not-pending'],
    [{ status: 'NONE' }, registeredBinding(), 'linked'],
  ];
  for (const [registration, binding, phase] of cases) {
    const h = setup({ registrations: [registration], binding });
    await h.session.start();
    assert.equal(h.phase(), phase, JSON.stringify(registration));
    assert.equal(h.posted.length, 0);
    assert.equal(h.messageListeners.size, 0);
    assert.equal(h.timers.length, 0);
    assert.equal(h.calls.completeRegistration.length, 0);
    h.noStart();
  }
});

test('an unreadable registration or binding still ends without READY and without a start', async () => {
  const failed = setup({ registrations: [httpFailure(502)] });
  await failed.session.start();
  assert.equal(failed.phase(), 'failed');
  assert.equal(failed.session.getSnapshot().error.status, 502);
  assert.equal(failed.posted.length, 0);
  assert.equal(failed.messageListeners.size, 0);
  failed.noStart();

  const lost = setup({ registrations: [lostResponse()] });
  await lost.session.start();
  assert.equal(lost.phase(), 'failed');
  assert.equal(lost.session.getSnapshot().error.responseLost, true);
  assert.equal(lost.posted.length, 0);
});

test('without an opener the popup does nothing, and a closed opener is a dead end too', async () => {
  const none = setup({ opener: null });
  await none.session.start();
  assert.equal(none.phase(), 'no-opener');
  assert.equal(Object.values(none.calls).flat().length, 0, 'no API call at all');
  assert.equal(none.messageListeners.size, 0);
  assert.equal(none.timers.length, 0);

  const closed = setup({ opener: { closed: true, postMessage: () => { throw new Error('must not post'); } } });
  await closed.session.start();
  assert.equal(closed.phase(), 'no-opener');
  assert.equal(closed.messageListeners.size, 0);
  assert.equal(closed.timers.length, 0);
  closed.noStart();
});

test('a valid PROFILE completes exactly once with the attemptId and ID, then re-reads binding and status', async () => {
  const h = setup({ binding: registeredBinding() });
  await h.session.start();
  const handler = h.handler();
  h.send(profile());
  handler(h.message(profile()));
  handler(h.message(profile({ iidxId: '8765-4321' })));
  await drain();
  assert.equal(h.calls.completeRegistration.length, 1, 'two more PROFILE messages did not resend');
  assert.equal(h.calls.completeRegistration[0][0], ATTEMPT_ID);
  assert.equal(h.calls.completeRegistration[0][1], '1234-5678');
  assert.equal(h.phase(), 'done');
  assert.deepEqual(h.session.getSnapshot().binding, registeredBinding());
  assert.deepEqual(h.session.getSnapshot().status, idleStatus);
  assert.ok(h.calls.getBinding.length >= 1 && h.calls.getStatus.length >= 1);
  assert.equal(h.messageListeners.size, 0);
  assert.equal(h.timers[0].cleared, true);
  h.timers[0].callback();
  assert.equal(h.phase(), 'done', 'a stale timeout cannot undo a finished link');
  h.noStart();
});

const IGNORED = [
  ['another origin', { origin: 'https://evil.example' }, profile()],
  ['the frontend origin itself', { origin: 'https://scoreboard.example' }, profile()],
  ['eagate over http', { origin: 'http://p.eagate.573.jp' }, profile()],
  ['an eagate look-alike host', { origin: 'https://p.eagate.573.jp.evil.example' }, profile()],
  ['an empty origin', { origin: '' }, profile()],
  ['same origin but another window', { source: { postMessage() {} } }, profile()],
  ['same origin but no source', { source: null }, profile()],
  ['an extra key', {}, { ...profile(), extra: 1 }],
  ['a missing key', {}, { type: 'IIDX_LINK_PROFILE', version: 1, runId: RUN_ID }],
  ['version 2', {}, profile({ version: 2 })],
  ['version as a string', {}, profile({ version: '1' })],
  ['the READY type echoed back', {}, profile({ type: 'IIDX_LINK_READY' })],
  ['a lower-case type', {}, profile({ type: 'iidx_link_profile' })],
  ['a short runId', {}, profile({ runId: RUN_ID.slice(1) })],
  ['an upper-case runId', {}, profile({ runId: RUN_ID.toUpperCase() })],
  ['a non-hex runId', {}, profile({ runId: 'g'.repeat(32) })],
  ['a numeric runId', {}, profile({ runId: 12345678 })],
  ['an ID without the hyphen', {}, profile({ iidxId: '12345678' })],
  ['a full-width ID', {}, profile({ iidxId: '１２３４-５６７８' })],
  ['an ID with surrounding space', {}, profile({ iidxId: ' 1234-5678' })],
  ['a null ID', {}, profile({ iidxId: null })],
  ['an array', {}, [profile()]],
  ['null', {}, null],
  ['undefined', {}, undefined],
  ['a string', {}, JSON.stringify(profile())],
];

test('messages from the wrong origin or window, or off the schema, change nothing', async () => {
  // GET /crawler/iidx/me must report the link for the final read to call it done.
  const h = setup({ binding: registeredBinding() });
  await h.session.start();
  const before = h.session.getSnapshot();
  let notified = 0;
  h.session.subscribe(() => { notified += 1; });
  const handler = h.handler();
  for (const [name, overrides, data] of IGNORED) {
    handler(h.message(data, overrides));
    assert.equal(h.session.getSnapshot(), before, name);
  }
  await drain();
  assert.equal(notified, 0);
  assert.equal(h.calls.completeRegistration.length, 0);
  assert.equal(h.messageListeners.size, 1, 'still listening for the real message');
  h.send(profile());
  await drain();
  assert.equal(h.calls.completeRegistration.length, 1);
  assert.equal(h.phase(), 'done');
  h.noStart();
});

test('a lost response never resends complete and the outcome is decided by re-reading', async () => {
  const done = setup({ complete: () => Promise.reject(lostResponse()), binding: registeredBinding(),
    registrations: [pending(), { status: 'NONE' }] });
  await done.session.start();
  done.send(profile());
  await drain();
  assert.equal(done.calls.completeRegistration.length, 1);
  assert.equal(done.phase(), 'done', 'the re-read shows the same ID linked');
  assert.ok(done.calls.getRegistration.length >= 2);
  assert.ok(done.calls.getBinding.length >= 1);

  const failed = setup({ complete: () => Promise.reject(lostResponse()), registrations: [pending(), { status: 'PENDING', attemptId: ATTEMPT_ID }] });
  await failed.session.start();
  const handler = failed.handler();
  failed.send(profile());
  await drain();
  handler(failed.message(profile()));
  await drain();
  assert.equal(failed.calls.completeRegistration.length, 1);
  assert.equal(failed.phase(), 'failed');
  assert.equal(failed.session.getSnapshot().error.responseLost, true);
  assert.equal(failed.session.getSnapshot().registrationStatus, 'PENDING');
  assert.equal(failed.messageListeners.size, 0);

  const other = setup({ complete: () => Promise.reject(lostResponse()), binding: registeredBinding('8765-4321') });
  await other.session.start();
  other.send(profile());
  await drain();
  assert.equal(other.calls.completeRegistration.length, 1);
  assert.equal(other.phase(), 'failed', 'a different linked ID is not our success');
});

test('REGISTRATION_ALREADY_CONSUMED and other re-query codes also re-read instead of resending', async () => {
  const consumed = () => Promise.reject(httpFailure(409, { code: 'REGISTRATION_ALREADY_CONSUMED', message: 'RAW' }));
  const linked = setup({ complete: consumed, binding: registeredBinding() });
  await linked.session.start();
  linked.send(profile());
  await drain();
  assert.equal(linked.calls.completeRegistration.length, 1);
  assert.equal(linked.phase(), 'done');

  const unlinked = setup({ complete: consumed });
  await unlinked.session.start();
  unlinked.send(profile());
  await drain();
  assert.equal(unlinked.calls.completeRegistration.length, 1);
  assert.equal(unlinked.phase(), 'failed');
  assert.equal(unlinked.session.getSnapshot().error.code, 'REGISTRATION_ALREADY_CONSUMED');
  assert.doesNotMatch(unlinked.session.getSnapshot().error.message, /RAW/);

  const taken = () => Promise.reject(httpFailure(409, { code: 'IIDX_ALREADY_REGISTERED' }));
  const another = setup({ complete: taken, binding: registeredBinding('8765-4321') });
  await another.session.start();
  another.send(profile());
  await drain();
  assert.equal(another.calls.completeRegistration.length, 1);
  assert.equal(another.phase(), 'failed');
  assert.match(another.session.getSnapshot().error.message, /다른 IIDX 코드\(8765-4321\)/);

  const same = setup({ complete: taken, binding: registeredBinding() });
  await same.session.start();
  same.send(profile());
  await drain();
  assert.equal(same.calls.completeRegistration.length, 1);
  assert.equal(same.phase(), 'done');
});

test('refusals that cannot have succeeded fail at once without re-reading or resending', async () => {
  for (const [status, code] of [[410, 'REGISTRATION_EXPIRED'], [400, 'INVALID_IIDX_ID'], [401, 'SITE_LOGIN_REQUIRED'], [403, 'CSRF_FORBIDDEN']]) {
    const h = setup({ complete: () => Promise.reject(httpFailure(status, { code })) });
    await h.session.start();
    h.send(profile());
    await drain();
    assert.equal(h.calls.completeRegistration.length, 1, code);
    assert.equal(h.phase(), 'failed', code);
    assert.equal(h.session.getSnapshot().error.code, code);
    assert.equal(h.calls.getRegistration.length, 1, `${code} re-read nothing`);
    assert.equal(h.calls.getBinding.length, 0, `${code} re-read nothing`);
    h.send(profile());
    await drain();
    assert.equal(h.calls.completeRegistration.length, 1, `${code} after failure`);
    h.noStart();
  }
});

test('no PROFILE within the wait fails the session, and a late PROFILE is ignored', async () => {
  const h = setup();
  await h.session.start();
  const handler = h.handler();
  assert.equal(h.timers[0].delay, 10000);
  h.timers[0].callback();
  assert.equal(h.phase(), 'failed');
  assert.equal(h.session.getSnapshot().error.code, 'PROFILE_TIMEOUT');
  assert.equal(h.messageListeners.size, 0);
  handler(h.message(profile()));
  await drain();
  assert.equal(h.calls.completeRegistration.length, 0);
  assert.equal(h.phase(), 'failed');
  h.noStart();
});

test('dispose stops listening, aborts reads, and ignores a late response or message', async () => {
  let answer;
  const unanswered = setup({ registrations: [new Promise((resolve) => { answer = resolve; })] });
  const starting = unanswered.session.start();
  unanswered.session.dispose();
  answer(pending());
  await starting;
  assert.equal(unanswered.calls.getRegistration[0][0].signal.aborted, true);
  assert.equal(unanswered.posted.length, 0, 'a response that arrives after dispose sends no READY');
  assert.equal(unanswered.messageListeners.size, 0);
  assert.equal(unanswered.timers.length, 0);

  const early = setup();
  await early.session.start();
  const handler = early.handler();
  const signal = early.calls.getRegistration[0][0].signal;
  early.session.dispose();
  assert.equal(signal.aborted, true);
  assert.equal(early.messageListeners.size, 0);
  assert.equal(early.timers[0].cleared, true);
  handler(early.message(profile()));
  await drain();
  assert.equal(early.calls.completeRegistration.length, 0);
  assert.equal(early.phase(), 'waiting', 'a disposed session no longer updates');

  let release;
  const late = setup({ complete: () => new Promise((resolve) => { release = resolve; }) });
  await late.session.start();
  late.send(profile());
  await drain();
  assert.equal(late.phase(), 'completing');
  late.session.dispose();
  release(registeredBinding());
  await drain();
  assert.equal(late.phase(), 'completing');
  assert.equal(late.calls.completeRegistration.length, 1);
  assert.equal(late.calls.getStatus.length, 0);
});

// Review follow-ups: only answers that prove nothing was linked end the run directly.
test('a 5xx or code-less failure after complete is settled by re-reading, never by resending', async () => {
  for (const failure of [httpFailure(502), httpFailure(500, { message: 'proxy page' }), httpFailure(409, { code: 'NEW_UNKNOWN_CODE' })]) {
    const linked = setup({ complete: () => Promise.reject(failure), binding: registeredBinding() });
    await linked.session.start();
    linked.send(profile());
    await drain();
    assert.equal(linked.calls.completeRegistration.length, 1);
    assert.equal(linked.phase(), 'done', 'the commit behind a bad gateway is found by GET');
    assert.ok(linked.calls.getBinding.length >= 1);

    const unlinked = setup({ complete: () => Promise.reject(failure) });
    await unlinked.session.start();
    unlinked.send(profile());
    await drain();
    assert.equal(unlinked.calls.completeRegistration.length, 1);
    assert.equal(unlinked.phase(), 'failed');
    assert.match(unlinked.session.getSnapshot().error.message, /결과를 확인하지 못했습니다/);
    assert.doesNotMatch(unlinked.session.getSnapshot().error.message, /proxy page/);
    unlinked.noStart();
  }
});

test('a complete that never answers is cut after its timeout and then re-read once', async () => {
  let seenSignal;
  const h = setup({
    binding: registeredBinding(),
    complete: (_attemptId, _iidxId, { signal }) => {
      seenSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })));
      });
    },
  });
  await h.session.start();
  h.send(profile());
  await drain();
  assert.equal(h.phase(), 'completing');
  const cut = h.timers.find((timer) => timer.delay === 20000 && !timer.cleared);
  assert.ok(cut, 'a 20 s complete timer is armed');
  cut.callback();
  await drain();
  assert.equal(seenSignal.aborted, true);
  assert.equal(h.calls.completeRegistration.length, 1);
  assert.equal(h.phase(), 'done');
});

test('a definite refusal still fails without re-reading even when the status is 503', async () => {
  const h = setup({ complete: () => Promise.reject(httpFailure(503, { code: 'RIVAL_COLLECTION_DISABLED' })) });
  await h.session.start();
  h.send(profile());
  await drain();
  assert.equal(h.phase(), 'failed');
  assert.equal(h.calls.getBinding.length, 0);
  assert.equal(h.calls.completeRegistration.length, 1);
});

// Review follow-up: the done screen trusts the re-read, not the complete answer.
test('an unlink in another tab before the re-read ends as changed, never as done', async () => {
  const h = setup();
  const phases = [];
  h.session.subscribe(() => phases.push(h.phase()));
  await h.session.start();
  // complete answers linked, then GET /crawler/iidx/me reports the binding gone.
  h.send(profile());
  await drain();
  assert.equal(h.calls.completeRegistration.length, 1);
  assert.equal(h.phase(), 'changed');
  assert.equal(h.session.getSnapshot().binding.iidxId, null);
  assert.ok(!phases.includes('done'), `phases were ${phases.join(' > ')}`);
  h.noStart();
});

test('a different ID found by the re-read is shown as changed with that ID', async () => {
  const h = setup({ binding: registeredBinding('8765-4321') });
  await h.session.start();
  h.send(profile());
  await drain();
  assert.equal(h.phase(), 'changed');
  assert.equal(h.session.getSnapshot().binding.iidxId, '8765-4321');
  assert.equal(h.calls.completeRegistration.length, 1);
});

test('when the re-read itself fails the result stays done and says it was not re-checked', async () => {
  const h = setup();
  await h.session.start();
  h.binding = Promise.reject(new Error('network'));
  h.binding.catch(() => {});
  h.send(profile());
  await drain();
  assert.equal(h.phase(), 'done');
  assert.equal(h.session.getSnapshot().bindingChecked, false);
  assert.equal(h.session.getSnapshot().binding.iidxId, '1234-5678', 'the complete answer is shown');
  assert.equal(h.calls.completeRegistration.length, 1);
});
