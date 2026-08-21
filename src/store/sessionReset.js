import { useAuthStore } from './authStore';
import useTierStore from './tierStore';
import { useScoresStore } from './scoresStore';

/**
 * Wipes every per-user cache whenever the signed-in identity changes.
 *
 * `tierStore` memoizes a whole scope's joined tier data + clear lamps and
 * `authStore.logout` only clears the auth slice, so without this a logout
 * followed by a different login served the FIRST user's scores to the
 * SECOND one — the cache key names the scope, not the person.
 *
 * This is a single subscription rather than a call at each of the four
 * places identity changes (session restore in App.jsx, Login, the sidebar's
 * logout, and the 401 interceptor in api/sessionExpiry.js). Those are easy
 * to add a fifth to and forget; a subscription cannot be forgotten.
 *
 * Import once, for the side effect, from the app entry. `tierStore` also
 * keys its cache by user id as a second line of defence, so a failure here
 * degrades to a redundant refetch rather than to leaked data.
 */
useAuthStore.subscribe((state, prev) => {
  if (state.user?.id === prev.user?.id) return;

  useTierStore.getState().reset();
  useScoresStore.getState().resetFilters();
});
