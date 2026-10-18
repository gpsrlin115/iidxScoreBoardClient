// A generation check also protects consumers when a transport ignores abort.
export function createRequestGuard() {
  let epoch = 0;
  const pending = new Map();
  return {
    begin(key) {
      pending.get(key)?.controller.abort();
      const token = { key, epoch, controller: new AbortController() };
      token.signal = token.controller.signal;
      pending.set(key, token);
      return token;
    },
    isCurrent(token) {
      return token.epoch === epoch && pending.get(token.key) === token && !token.signal.aborted;
    },
    invalidate(key) {
      pending.get(key)?.controller.abort();
      pending.delete(key);
    },
    invalidateAll() {
      epoch += 1;
      pending.forEach((token) => token.controller.abort());
      pending.clear();
    },
  };
}
