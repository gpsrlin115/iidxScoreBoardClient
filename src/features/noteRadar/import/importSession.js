import { ATTEMPT_FORMAT, EAGATE_ORIGIN, readRadarMessage } from './protocol.js';
import { importError } from './importErrors.js';

export function createImportSession({ api, win, schedule = setTimeout, unschedule = clearTimeout,
  now = Date.now, readTimeoutMs = 10000, completeTimeoutMs = 20000, messageTimeoutMs = 30000 }) {
  let state = { phase: 'checking', payload: null, error: null };
  let disposed = false;
  let started = false;
  let completeSent = false;
  let opener;
  let attempt;
  let messageTimer;
  const requests = new Set();
  const listeners = new Set();
  const update = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((notify) => notify());
  };
  const stopListening = () => {
    unschedule(messageTimer);
    win.removeEventListener('message', onMessage);
  };
  const fail = (message) => { stopListening(); update({ phase: 'failed', error: message }); };

  function bounded(call, timeoutMs) {
    const controller = new AbortController();
    let timer;
    let cancelled;
    const cancel = () => { controller.abort(); cancelled(new Error('REQUEST_TIMEOUT')); };
    requests.add(cancel);
    const timeout = new Promise((_, reject) => {
      cancelled = reject;
      timer = schedule(cancel, timeoutMs);
    });
    const result = Promise.resolve().then(() => call(controller.signal));
    return Promise.race([result, timeout]).finally(() => {
      unschedule(timer);
      requests.delete(cancel);
    });
  }

  function onMessage(event) {
    if (disposed || state.phase !== 'waiting' || event.origin !== EAGATE_ORIGIN || event.source !== opener) return;
    const payload = readRadarMessage(event.data, attempt.attemptId);
    if (!payload) return;
    stopListening();
    if (Date.parse(attempt.expiresAt) <= now()) { fail('가져오기 시간이 만료됐습니다. 원래 화면에서 다시 시작해 주세요.'); return; }
    update({ phase: 'reviewing', payload });
  }

  async function start() {
    if (disposed || started) return;
    started = true;
    opener = win.opener;
    if (!opener || opener.closed) { update({ phase: 'no-opener' }); return; }
    try {
      attempt = await bounded((signal) => api.current({ signal }), readTimeoutMs);
    } catch (error) {
      if (!disposed) fail(importError(error));
      return;
    }
    if (disposed) return;
    if (attempt?.status !== 'PENDING' || !ATTEMPT_FORMAT.test(attempt?.attemptId ?? '')
      || !Number.isFinite(Date.parse(attempt?.expiresAt)) || Date.parse(attempt.expiresAt) <= now()) {
      update({ phase: 'not-pending' }); return;
    }
    if (opener.closed) { update({ phase: 'no-opener' }); return; }
    win.addEventListener('message', onMessage);
    update({ phase: 'waiting' });
    messageTimer = schedule(() => { if (state.phase === 'waiting') fail('공식 페이지의 응답이 없어 멈췄습니다. 이 창을 닫고 다시 시작해 주세요.'); },
      Math.min(messageTimeoutMs, Date.parse(attempt.expiresAt) - now()));
    opener.postMessage({ type: 'IIDX_RADAR_READY', version: 1, attemptId: attempt.attemptId }, EAGATE_ORIGIN);
  }

  async function confirm() {
    if (disposed || state.phase !== 'reviewing' || completeSent) return;
    if (Date.parse(attempt.expiresAt) <= now()) { fail('가져오기 시간이 만료됐습니다. 원래 화면에서 다시 시작해 주세요.'); return; }
    completeSent = true;
    update({ phase: 'completing' });
    try {
      await bounded((signal) => api.complete(attempt.attemptId, state.payload, { signal }), completeTimeoutMs);
      update({ phase: 'done', payload: null });
    } catch (error) {
      if (disposed) return;
      // A lost POST response can hide a committed import. Re-read; never POST twice.
      let current;
      try { current = await bounded((signal) => api.current({ signal }), readTimeoutMs); } catch { /* A separate read deadline still ends the UI. */ }
      if (disposed) return;
      if (current?.status === 'COMPLETED' && current.attemptId === attempt.attemptId) update({ phase: 'done', payload: null });
      else fail(error?.status >= 400 && error?.status < 500 ? importError(error)
        : '저장 결과를 확인하지 못했습니다. 원래 화면에서 현재 기록을 새로고침해 확인해 주세요. 같은 요청을 다시 보내지 않았습니다.');
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (notify) => { listeners.add(notify); return () => listeners.delete(notify); },
    start,
    confirm,
    dispose: () => {
      disposed = true;
      stopListening();
      requests.forEach((cancel) => cancel());
      requests.clear();
      state = { phase: 'disposed', payload: null, error: null };
      opener = null;
      attempt = null;
    },
  };
}
