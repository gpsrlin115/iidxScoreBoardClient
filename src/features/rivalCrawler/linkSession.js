import { classifyRivalError, isLinkedBinding, normalizeIidxId, REQUERY_CODES } from '../../utils/rivalCrawler.js';
import { EAGATE_ORIGIN, READY_MESSAGE, READY_TIMEOUT_MS, readProfileMessage } from './bookmarklet.js';

const ATTEMPT_ID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Answers that prove complete did not link anything. Every other failure (5xx from a
// proxy, an unknown code, no response, the 409 re-query codes) may hide a committed
// complete, so it is settled by GET instead of being reported as a failure.
const DEFINITE_FAILURES = new Set([
  'INVALID_IIDX_ID', 'INVALID_REGISTRATION_INPUT', 'SITE_LOGIN_REQUIRED', 'CSRF_FORBIDDEN', 'FORBIDDEN',
  'REGISTRATION_EXPIRED', 'REGISTRATION_RATE_LIMIT', 'RIVAL_COLLECTION_DISABLED',
]);
const COMPLETE_TIMEOUT_MS = 20000;
// Each follow-up GET (binding, job status, registration) gets its own limit. Without it a
// single hung read kept the popup on "completing" after the link had already been saved.
const READ_TIMEOUT_MS = 10000;
const READ_FAILED = Object.freeze({ ok: false });

/**
 * Phases, in the order a successful run passes them:
 *   checking   GET the registration of this login round (never POST start here)
 *   waiting    READY sent to the opener; listening for one PROFILE message
 *   completing complete sent, exactly once, then binding and job status re-read
 *   done       the re-read shows the submitted ID linked (or could not be read)
 *   changed    complete went through, but the re-read shows no link or another ID
 *              (for example the user unlinked in another tab meanwhile)
 * Fail-closed exits, none of which sends READY or complete afterwards:
 *   no-opener  opened directly, popup handle lost, or a COOP split dropped window.opener
 *   not-pending no PENDING attempt in this round (start it on the original screen)
 *   linked     the account already has an IIDX ID (unlink first to change it)
 *   failed     timeout, server refusal, or an unconfirmed result
 */
export function createLinkSession({ api, win, timeoutMs = READY_TIMEOUT_MS,
  completeTimeoutMs = COMPLETE_TIMEOUT_MS, readTimeoutMs = READ_TIMEOUT_MS,
  schedule = setTimeout, unschedule = clearTimeout }) {
  // bindingChecked is false when the done screen could not re-read the binding.
  let state = { phase: 'checking', binding: null, status: null, bindingChecked: false, registrationStatus: null, error: null };
  let disposed = false;
  let started = false;
  let completeSent = false;
  let timer;
  let opener = null;
  let attemptId = null;
  const listeners = new Set();
  const abort = new AbortController();
  const signal = abort.signal;
  const update = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((notify) => notify());
  };
  const stopListening = () => {
    unschedule(timer);
    win.removeEventListener('message', onMessage);
  };
  const fail = (error) => { stopListening(); update({ phase: 'failed', error }); };

  // One follow-up GET that always settles: { ok: true, value } or READ_FAILED on an
  // error, on readTimeoutMs, or on dispose. The timer races the request instead of
  // only aborting it, so a transport that ignores abort still cannot hold the popup.
  function boundedRead(read) {
    const request = new AbortController();
    const onDispose = () => request.abort();
    signal.addEventListener('abort', onDispose);
    let readTimer;
    const timedOut = new Promise((resolve) => {
      readTimer = schedule(() => { request.abort(); resolve(READ_FAILED); }, readTimeoutMs);
    });
    const answered = Promise.resolve()
      .then(() => read(request.signal))
      .then((value) => ({ ok: true, value }), () => READ_FAILED);
    return Promise.race([answered, timedOut]).finally(() => {
      unschedule(readTimer);
      signal.removeEventListener('abort', onDispose);
    });
  }

  // Reads only. Used after any answer that leaves the outcome unclear.
  async function reread(submittedId) {
    const [bindingRead, registrationRead] = await Promise.all([
      boundedRead((s) => api.getBinding({ signal: s })),
      boundedRead((s) => api.getRegistration({ signal: s })),
    ]);
    const binding = bindingRead.ok ? bindingRead.value : null;
    const registration = registrationRead.ok ? registrationRead.value : null;
    const linked = isLinkedBinding(binding);
    return { binding, registration, linkedToSubmitted: linked && normalizeIidxId(binding.iidxId) === submittedId };
  }

  // The popup shows the result itself, so the outcome is what the server reports
  // now, not what complete answered: another tab may have unlinked in between.
  async function finishLinked(binding, submittedId) {
    const [fresh, statusRead] = await Promise.all([
      boundedRead((s) => api.getBinding({ signal: s })),
      boundedRead((s) => api.getStatus({ signal: s })),
    ]);
    if (disposed) return;
    // A missing job status only changes the hint on the done screen ("cannot check now").
    const status = statusRead.ok ? statusRead.value : null;
    if (!fresh.ok) {
      update({ phase: 'done', binding, status, bindingChecked: false, error: null });
      return;
    }
    const stillLinked = isLinkedBinding(fresh.value) && normalizeIidxId(fresh.value.iidxId) === submittedId;
    update({ phase: stillLinked ? 'done' : 'changed', binding: fresh.value, status, bindingChecked: true, error: null });
  }

  async function complete(iidxId) {
    if (completeSent) return;
    completeSent = true;
    update({ phase: 'completing' });
    // A hung request is cut after completeTimeoutMs and then treated like a lost response.
    const request = new AbortController();
    const onDispose = () => request.abort();
    signal.addEventListener('abort', onDispose);
    const requestTimer = schedule(() => request.abort(), completeTimeoutMs);
    try {
      const binding = await api.completeRegistration(attemptId, iidxId, { signal: request.signal });
      if (disposed) return;
      await finishLinked(binding, iidxId);
    } catch (error) {
      if (disposed) return;
      const info = classifyRivalError(error, 'complete');
      // Unless the answer proves nothing was linked, the first complete may have landed.
      // Never send it again; ask the server what happened instead.
      if (DEFINITE_FAILURES.has(info.code)) { fail(info); return; }
      const result = await reread(iidxId);
      if (disposed) return;
      if (result.linkedToSubmitted) { await finishLinked(result.binding, iidxId); return; }
      const refined = REQUERY_CODES.has(info.code)
        ? classifyRivalError(error, 'complete', Date.now(), { binding: result.binding, submittedId: iidxId })
        : { ...info, message: '연결 결과를 확인하지 못했습니다. 원래 화면에서 연결 상태를 새로고침해 확인해주세요.' };
      update({ binding: result.binding, registrationStatus: result.registration?.status ?? null });
      fail(refined);
    } finally {
      unschedule(requestTimer);
      signal.removeEventListener('abort', onDispose);
    }
  }

  function onMessage(event) {
    if (state.phase !== 'waiting' || completeSent) return;
    if (event.origin !== EAGATE_ORIGIN || event.source !== opener) return;
    const profile = readProfileMessage(event.data);
    if (!profile) return;
    stopListening();
    void complete(profile.iidxId);
  }

  async function start() {
    if (started || disposed) return;
    started = true;
    opener = win.opener ?? null;
    if (!opener) { update({ phase: 'no-opener' }); return; }
    let registration;
    try {
      registration = await api.getRegistration({ signal });
    } catch (error) {
      if (!disposed) fail(classifyRivalError(error, 'status'));
      return;
    }
    if (disposed) return;
    const pending = registration?.status === 'PENDING' && ATTEMPT_ID_FORMAT.test(registration.attemptId ?? '');
    if (!pending) {
      const binding = await api.getBinding({ signal }).catch(() => null);
      if (disposed) return;
      update({ phase: isLinkedBinding(binding) ? 'linked' : 'not-pending', binding,
        registrationStatus: registration?.status ?? null });
      return;
    }
    attemptId = registration.attemptId;
    if (opener.closed) { update({ phase: 'no-opener' }); return; }
    win.addEventListener('message', onMessage);
    update({ phase: 'waiting' });
    timer = schedule(() => {
      if (state.phase === 'waiting') {
        fail({ code: 'PROFILE_TIMEOUT', message: '프로필 창에서 응답이 오지 않아 멈췄습니다. 이 창을 닫고 원래 화면에서 다시 시작해주세요.' });
      }
    }, timeoutMs);
    // Exact target origin: if the opener is anywhere other than eagate, the browser drops this.
    opener.postMessage({ ...READY_MESSAGE }, EAGATE_ORIGIN);
  }

  return {
    getSnapshot: () => state,
    subscribe: (notify) => { listeners.add(notify); return () => listeners.delete(notify); },
    start,
    dispose: () => {
      stopListening();
      disposed = true;
      abort.abort();
      opener = null;
      attemptId = null;
    },
  };
}
