/**
 * Bridge between react-router's imperative navigation and code that runs
 * outside the React render tree (e.g. the axios response interceptor),
 * where `useNavigate()` cannot be called directly.
 *
 * `NavigationBridge` (see `src/components/routing/NavigationBridge.jsx`)
 * registers the active `navigate` function via `setNavigator()` on mount.
 * Until it registers (or after it unmounts), `navigateTo()` falls back to a
 * full-page navigation.
 */

let activeNavigator = null;

/**
 * Register (or clear, with `null`) the active react-router navigate function.
 *
 * @param {((to: string, options?: object) => void) | null} fn
 */
export function setNavigator(fn) {
  activeNavigator = fn;
}

/**
 * Navigate to `to`, preferring SPA navigation when a navigator is
 * registered, otherwise falling back to a full-page navigation.
 *
 * @param {string} to
 * @param {object} [options] - react-router navigate options (e.g. { replace: true })
 */
export function navigateTo(to, options) {
  if (activeNavigator) {
    activeNavigator(to, options);
    return;
  }
  window.location.assign(to);
}
