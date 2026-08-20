/**
 * The request-admission state machine behind `tierStore.fetchTierData`,
 * kept out of the store so the cache/race rules can be exercised directly
 * under plain `node:test`.
 *
 * It owns exactly two pieces of state:
 * - `latestRequestId` — monotonic. Only the newest request may write into
 *   the store; everything older is discarded on arrival.
 * - `inFlight` — `{ key, requestId }` for the request currently on the
 *   wire, or null. It is a SLOT OWNED BY A REQUEST ID, not just a key.
 *   That distinction is the whole point: keying it alone leaked the slot
 *   whenever a request was superseded, and a leaked slot made every later
 *   caller for that scope "join" a request that no longer existed — no
 *   spinner, no data, until something forced a refetch.
 */

/**
 * @typedef {'join-inflight' | 'serve-cache' | 'fetch'} TierFetchDecision
 *
 * - `join-inflight` — an identical, still-valid request is already running.
 *   Ride along: do NOT bump the request id, or the request gets cancelled
 *   for nothing. That cancellation is what used to throw away a CSV
 *   import's forced refresh the moment any screen re-entered the scope.
 * - `serve-cache` — this scope is already settled. Skip the network, but
 *   still bump the id (invalidating a request for a DIFFERENT scope) and
 *   clear that request's spinner, since an invalidated request returns
 *   before its own `isLoading: false` and nothing else would turn it off.
 * - `fetch` — go to the network.
 */

export const createTierFetchGate = () => {
  let latestRequestId = 0;
  let inFlight = null;

  /**
   * Admit or reject an entry into fetchTierData.
   *
   * On `fetch` the returned `requestId` owns the in-flight slot and must be
   * handed back to `settle()` exactly once. On the other two decisions
   * `requestId` is null and there is nothing to settle.
   *
   * @param {{ force?: boolean, key: string, fetchedKey: string | null, hasError?: boolean }} input
   * @returns {{ decision: TierFetchDecision, requestId: number | null }}
   */
  const enter = ({ force = false, key, fetchedKey, hasError = false }) => {
    // Only join a request that will actually WRITE its result. A request
    // whose id has already been superseded discards itself on arrival, so
    // joining it would mean waiting forever for data nobody will store.
    const joinable = inFlight !== null
      && inFlight.key === key
      && inFlight.requestId === latestRequestId;

    if (!force && joinable) return { decision: 'join-inflight', requestId: null };

    const requestId = (latestRequestId += 1);

    if (!force && fetchedKey !== null && fetchedKey === key && !hasError) {
      // A stored error deliberately defeats the cache: a failed scope is
      // never memoized as fetched, so the next entry retries the network.
      return { decision: 'serve-cache', requestId };
    }

    inFlight = { key, requestId };
    return { decision: 'fetch', requestId };
  };

  /**
   * Free the slot when a request finishes, whatever the outcome.
   *
   * Unconditional on purpose — a superseded request must still hand its
   * slot back. It is scoped by owner id so a request that arrives after a
   * NEWER one already claimed the slot cannot free someone else's.
   */
  const settle = (requestId) => {
    if (inFlight !== null && inFlight.requestId === requestId) inFlight = null;
  };

  /** Whether this request is still the one allowed to write. */
  const isCurrent = (requestId) => requestId === latestRequestId;

  /**
   * Invalidate everything in flight. Used when the signed-in identity
   * changes: a response fetched for the previous user must not land in the
   * store after it has been cleared for the next one.
   */
  const invalidateAll = () => {
    latestRequestId += 1;
    inFlight = null;
  };

  return { enter, settle, isCurrent, invalidateAll };
};

export default createTierFetchGate;
