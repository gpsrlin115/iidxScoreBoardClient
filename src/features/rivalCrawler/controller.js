import { classifyRivalError, isActiveJob, isTerminalJob } from '../../utils/rivalCrawler.js';

const initialState = () => ({ binding: null, status: null, loading: true, ready: false, action: null, error: null, retryBlockedAction: null });

/** One owner for mutations, status polling, and response generations. No credentials live in state. */
export function createRivalController({ api, onTerminal = () => {}, interval = 5000,
  schedule = setTimeout, unschedule = clearTimeout }) {
  let state = initialState();
  let live = false;
  let generation = 0;
  let timer;
  let readPromise;
  let readAbort;
  let mutationAbort;
  let retryTimer;
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
  const noticeTerminal = (job) => {
    if (!isTerminalJob(job)) return;
    const key = `${job.id}:${job.status}`;
    if (terminals.has(key)) return;
    terminals.add(key);
    onTerminal(job);
  };
  const later = () => {
    clearTimer();
    if (live && !state.action && isActiveJob(state.status?.latestJob)) {
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
        const job = status.latestJob;
        const key = `${job?.id}:${job?.status}`;
        const terminalChanged = isTerminalJob(job) && !terminals.has(key);
        update({ status });
        // A terminal status is enough to invalidate scores, even when the binding read fails.
        noticeTerminal(job);
        let binding = state.binding;
        if (full || terminalChanged) {
          binding = await api.getBinding({ signal: abort.signal });
          if (!current(owner)) return;
        }
        update({ status, binding, ready: true, error: null });
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
    const active = isActiveJob(state.status?.latestJob);
    if (action === 'verify' && (!state.ready || active)) return;
    if (action === 'enqueue' && (!state.ready || !state.binding?.verified || state.status?.enabled !== true
      || active || state.status?.cooldownUntil != null)) return;
    if (action === 'cancel' && !active) return;
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
        if (current(owner)) update({ binding: { iidxId: null, verified: false, verifiedAt: null }, ready: false });
      } else {
        const job = await api[action]({ signal: abort.signal });
        if (current(owner)) {
          update({ status: { ...state.status, latestJob: job } });
          // Invalidate immediately even if the follow-up binding GET fails.
          noticeTerminal(job);
        }
      }
    } catch (error) {
      if (!current(owner) || cancelled(error)) return;
      errorInfo = classifyRivalError(error, action);
      if (errorInfo.status === 429 && errorInfo.retryAfterSeconds > 0) {
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
      update(initialState());
    },
    refresh,
    verify: (cookie) => mutate('verify', cookie),
    enqueue: () => mutate('enqueue'),
    cancel: () => mutate('cancel'),
    unlink: () => mutate('unlink'),
  };
}
