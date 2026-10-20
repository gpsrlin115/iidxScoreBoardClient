import {
  classifyRivalError, DEFAULT_PLAY_STYLES, EMPTY_BINDING, isLinkedBinding, isRequestActive, isRequestTerminal,
  normalizePlayStyles, parseUtcInstant, requestJobs, requestKey,
} from '../../utils/rivalCrawler.js';

// `registration` is the GET /crawler/iidx/bookmarklet/me view of this login round.
// `registrationBlockedUntil` (epoch ms) holds the hourly start limit apart from
// `retryBlockedAction`, so a verify 429 and a start 429 cannot overwrite each other.
const initialState = () => ({ binding: null, status: null, registration: null, loading: true, ready: false,
  action: null, error: null, retryBlockedAction: null, registrationBlockedUntil: null });

/** One owner for mutations, status polling, and response generations. No credentials live in state. */
export function createRivalController({ api, onTerminal = () => {}, interval = 5000,
  schedule = setTimeout, unschedule = clearTimeout, now = Date.now }) {
  let state = initialState();
  let live = false;
  let generation = 0;
  let timer;
  let readPromise;
  let readAbort;
  let mutationAbort;
  let retryTimer;
  let registrationTimer;
  const listeners = new Set();
  const terminals = new Set();
  const update = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((notify) => notify());
  };
  const current = (owner) => live && owner === generation;
  const clearTimer = () => { unschedule(timer); timer = undefined; };
  const invalidateReads = () => {
    generation += 1;
    clearTimer();
    readAbort?.abort();
  };
  const cancelled = (error) => error?.name === 'AbortError' || error?.code === 'ERR_CANCELED';
  // One request may hold an SP and a DP job. Scores are refreshed once, when every
  // job of that request has ended; SP finishing while DP still runs is not the end.
  const noticeTerminal = (status) => {
    if (!isRequestTerminal(status)) return;
    const key = requestKey(status);
    if (terminals.has(key)) return;
    terminals.add(key);
    onTerminal(status);
  };
  const blockRegistrationUntil = (untilMs) => {
    if (untilMs == null || untilMs <= now()) return;
    if (state.registrationBlockedUntil != null && state.registrationBlockedUntil >= untilMs) return;
    unschedule(registrationTimer);
    update({ registrationBlockedUntil: untilMs });
    registrationTimer = schedule(() => {
      if (live) update({ registrationBlockedUntil: null });
    }, untilMs - now());
  };
  // Older servers have no registration API; that must not make the collection card unusable.
  const readRegistration = async (signal) => {
    try {
      return await api.getRegistration({ signal });
    } catch (error) {
      if (cancelled(error)) throw error;
      return null;
    }
  };
  const later = () => {
    clearTimer();
    if (live && !state.action && isRequestActive(state.status)) {
      // Schedule after settlement, so a slow GET cannot overlap the next poll.
      const retryDelay = state.error?.status === 429 ? (state.error.retryAfterSeconds ?? 0) * 1000 : 0;
      timer = schedule(() => { void refresh(false); }, Math.max(interval, retryDelay));
    }
  };
  async function refresh(full = true) {
    if (!live || state.action) return;
    if (readPromise) return readPromise;
    const owner = generation;
    const abort = new AbortController();
    readAbort = abort;
    clearTimer();
    update({ loading: true });
    readPromise = (async () => {
      try {
        const status = await api.getStatus({ signal: abort.signal });
        if (!current(owner)) return;
        const terminalChanged = isRequestTerminal(status) && !terminals.has(requestKey(status));
        update({ status });
        // A terminal status is enough to invalidate scores, even when the binding read fails.
        noticeTerminal(status);
        let binding = state.binding;
        let registration = state.registration;
        if (full || terminalChanged) {
          binding = await api.getBinding({ signal: abort.signal });
          if (!current(owner)) return;
          // A linked account cannot start; skip the extra GET instead of showing an old attempt.
          registration = isLinkedBinding(binding) ? null : await readRegistration(abort.signal);
          if (!current(owner)) return;
        }
        update({ status, binding, registration, ready: true, error: null });
        blockRegistrationUntil(parseUtcInstant(registration?.retryAt));
      } catch (error) {
        if (!current(owner) || cancelled(error)) return;
        const info = classifyRivalError(error, 'status');
        // Keep the last job visible, but do not admit a new mutation with stale readiness.
        update({ error: info, ready: false });
      } finally {
        if (readAbort === abort) readAbort = undefined;
        readPromise = undefined;
        if (current(owner)) { update({ loading: false }); later(); }
      }
    })();
    return readPromise;
  }
  async function mutate(action, credential) {
    if (!live) return;
    if (state.retryBlockedAction === action) return;
    // Unlink may supersede a pending verification. All other writes share a synchronous lock.
    if (state.action && !(action === 'unlink' && state.action === 'verify')) return;
    const active = isRequestActive(state.status);
    const linked = isLinkedBinding(state.binding);
    const playStyles = action === 'enqueue' ? normalizePlayStyles(credential) : null;
    const attemptId = state.registration?.status === 'PENDING' ? state.registration.attemptId : null;
    // Re-verifying a linked binding first clears it server-side, and a failure leaves it unlinked.
    if (action === 'verify' && (!state.ready || active || linked)) return;
    if (action === 'enqueue' && (!playStyles || !state.ready || !linked || state.status?.enabled !== true
      || active || state.status?.cooldownUntil != null)) return;
    if (action === 'cancel' && !active) return;
    // Start only on an explicit user action; the server answers 409/429 for the rest, but
    // these local gates keep a stale screen from spending one of the three hourly starts.
    if (action === 'register' && (!state.ready || linked || active || state.status?.enabled !== true
      || state.registrationBlockedUntil != null)) return;
    if (action === 'cancelRegistration' && !attemptId) return;
    mutationAbort?.abort();
    invalidateReads();
    const owner = generation;
    const abort = new AbortController();
    mutationAbort = abort;
    update({ action, loading: false, error: null });
    let errorInfo = null;
    try {
      if (action === 'verify') {
        const binding = await api.verify(credential, { signal: abort.signal });
        if (current(owner)) update({ binding });
      } else if (action === 'unlink') {
        await api.unlink({ signal: abort.signal });
        if (current(owner)) update({ binding: { ...EMPTY_BINDING }, registration: null, ready: false });
      } else if (action === 'register') {
        const started = await api.startRegistration({ signal: abort.signal });
        if (current(owner)) update({ registration: { ...started, retryAt: null } });
      } else if (action === 'cancelRegistration') {
        await api.cancelRegistration(attemptId, { signal: abort.signal });
      } else if (action === 'enqueue') {
        // 202 returns only the first job (SP when chosen). Show it as a new request until
        // the GET in `finally` brings the full `jobs` list.
        const job = await api.enqueue(playStyles, { signal: abort.signal });
        if (current(owner)) update({ status: { ...state.status, latestJob: job, jobs: [job] } });
      } else {
        // DELETE stops every running job of the request (SP and DP) and answers with one job.
        const job = await api.cancel({ signal: abort.signal });
        if (current(owner)) {
          const jobs = requestJobs(state.status).map((item) => (item.id === job?.id ? job : item));
          const next = { ...state.status, latestJob: job, ...(Array.isArray(state.status?.jobs) ? { jobs } : {}) };
          update({ status: next });
          // Invalidate immediately even if the follow-up binding GET fails.
          noticeTerminal(next);
        }
      }
    } catch (error) {
      if (!current(owner) || cancelled(error)) return;
      errorInfo = classifyRivalError(error, action, now(), { binding: state.binding });
      if (action === 'register' && errorInfo.status === 429) {
        blockRegistrationUntil(errorInfo.retryAt ?? (errorInfo.retryAfterSeconds > 0
          ? now() + errorInfo.retryAfterSeconds * 1000 : null));
      } else if (errorInfo.status === 429 && errorInfo.retryAfterSeconds > 0) {
        unschedule(retryTimer);
        update({ retryBlockedAction: action });
        retryTimer = schedule(() => {
          if (live) update({ retryBlockedAction: null });
        }, errorInfo.retryAfterSeconds * 1000);
      }
    } finally {
      credential = undefined;
      if (mutationAbort === abort) mutationAbort = undefined;
      if (current(owner)) {
        update({ action: null });
        // Wait out the superseded read even when a mock/transport ignores abort.
        await readPromise;
        if (current(owner)) {
          await refresh(true);
          if (current(owner) && errorInfo) { update({ error: errorInfo }); later(); }
        }
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (notify) => { listeners.add(notify); return () => listeners.delete(notify); },
    start: () => {
      live = true;
      const owner = ++generation;
      // React StrictMode can restart an effect while an aborted first read is settling.
      void Promise.resolve(readPromise).then(() => { if (current(owner)) void refresh(true); });
    },
    dispose: () => {
      live = false;
      invalidateReads();
      mutationAbort?.abort();
      unschedule(retryTimer);
      unschedule(registrationTimer);
      update(initialState());
    },
    refresh,
    verify: (cookie) => mutate('verify', cookie),
    enqueue: (playStyles = DEFAULT_PLAY_STYLES) => mutate('enqueue', playStyles),
    cancel: () => mutate('cancel'),
    unlink: () => mutate('unlink'),
    startRegistration: () => mutate('register'),
    cancelRegistration: () => mutate('cancelRegistration'),
  };
}
