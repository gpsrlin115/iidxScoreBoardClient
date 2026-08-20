/**
 * What `tierStore.fetchTierData` should do on entry, as a pure decision so
 * the cache/race rules can be tested under plain `node:test`.
 *
 * Three outcomes, and the difference between the first two is where the
 * bugs lived:
 *
 * - `join-inflight` — an identical, non-forced request is ALREADY running.
 *   Ride along: return without touching the request counter. Bumping it
 *   here is what used to cancel a CSV import's `force` refresh the moment
 *   any screen re-entered the same scope, leaving the tier table showing
 *   pre-import clear lamps.
 * - `serve-cache` — this scope is already settled, so skip the network.
 *   The caller still bumps the counter (invalidating a request for some
 *   OTHER scope), and because that invalidated request can never reach its
 *   own settle path, the caller must also clear `isLoading` here. Missing
 *   that is what left a permanent spinner after `☆12 → slow ☆11 → ☆12`.
 * - `fetch` — go to the network.
 *
 * A stored error deliberately defeats the cache: a failed scope is never
 * memoized as fetched, so the next entry retries.
 *
 * @param {{
 *   force?: boolean,
 *   requestedKey: string,
 *   fetchedKey: string | null,
 *   inFlightKey: string | null,
 *   hasError?: boolean,
 * }} input
 * @returns {'join-inflight' | 'serve-cache' | 'fetch'}
 */
export const decideTierFetch = ({
  force = false,
  requestedKey,
  fetchedKey,
  inFlightKey,
  hasError = false,
}) => {
  if (force) return 'fetch';
  if (inFlightKey !== null && inFlightKey === requestedKey) return 'join-inflight';
  if (fetchedKey !== null && fetchedKey === requestedKey && !hasError) return 'serve-cache';
  return 'fetch';
};

export default decideTierFetch;
