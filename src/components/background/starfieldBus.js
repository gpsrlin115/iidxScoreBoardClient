/**
 * Module-level registry of live starfield handles.
 *
 * Why a module bus instead of React Context:
 * - flareSky() fires from row hover handlers buried deep inside the dashboard
 *   recent list and the tier table. Threading a Provider value down through every
 *   intermediate section, list and row component just to reach a background canvas
 *   is wiring we do not want; a plain import reaches the handle from anywhere.
 * - The login screen lives outside the app shell, so it mounts its own Starfield
 *   without registering it. Nothing there can flare and the bus simply stays empty.
 *   With Context that case would need a second Provider or a null-value branch.
 *
 * A Set rather than a single slot keeps register/unregister order-independent,
 * which matters under React StrictMode where mount effects are run twice.
 */

const handles = new Set();

/** Register a handle exposing flare(). Ignores null/undefined. */
export function registerSky(handle) {
  if (handle) handles.add(handle);
}

/** Remove a previously registered handle. Safe to call for unknown handles. */
export function unregisterSky(handle) {
  handles.delete(handle);
}

/** Briefly brighten every registered starfield. Silent no-op when none is mounted. */
export function flareSky() {
  handles.forEach((handle) => {
    if (typeof handle.flare === 'function') handle.flare();
  });
}
