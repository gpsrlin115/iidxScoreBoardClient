/**
 * Whether tierStore's `enrichedTierData` (identified by its `fetchedKey`) is
 * safe for a caller to read as data for a given (level, playStyle).
 *
 * `fetchTierData`'s `set({ isLoading: true, error: null })` does NOT clear
 * `enrichedTierData` while a new scope's fetch is in flight -- the tier
 * table keeps showing the PREVIOUS scope's rows during the fetch rather than
 * flashing empty, which is the point for the tier table itself. But other
 * readers (the dashboard's per-tier progress rows, the scores screen's tier
 * badges) subscribe to `enrichedTierData` directly and have no such
 * intentional carry-over: switching SP -> DP can show DP stats next to SP's
 * tier-clear percentage until the new fetch lands, or forever if it fails,
 * since neither reader watches tierStore's own `isLoading`/`error`.
 *
 * `level === ''` is the scores screen's "all levels" override, which has no
 * single scope to fetch -- its own effect skips calling `fetchTierData`
 * entirely (see Scores.jsx). Gating that case here would make its tier
 * badge column permanently empty instead of showing its existing
 * best-effort behaviour (whichever numeric scope happened to load last).
 * Every caller with a real numeric level must be gated, or it silently
 * reads a different scope's data as its own.
 *
 * @param {string | null} fetchedKey - tierStore's current `state.fetchedKey`
 * @param {string | null} expectedKey - the caller's own scope key, built the
 *   same way tierStore builds `fetchedKey` (see tierStore.js's
 *   `buildFetchedKey`, exported for exactly this comparison)
 * @param {number | ''} level - the caller's requested level; only used to
 *   detect the "all levels" exemption above
 * @returns {boolean}
 */
export const isTierDataUsable = (fetchedKey, expectedKey, level) => (
  level === '' || (fetchedKey !== null && fetchedKey === expectedKey)
);

export default isTierDataUsable;
