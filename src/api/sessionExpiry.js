import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { navigateTo } from '../utils/navigation';
import { isGoogleCredentialRecheck } from '../utils/googleAuth';

/**
 * Global 401 handler.
 *
 * Kept out of `client.js` on purpose — `client.js` owns axios instance
 * *configuration* only (see the header comment in `src/api/auth.js`).
 */

// Endpoints where a 401 is part of the normal flow, not a "session expired"
// event — must never trigger the global redirect.
const EXEMPT_PREFIXES = [
  '/auth/login',
  '/auth/signup',
  '/auth/find-username',
  '/auth/password-reset',
];

// `/users/me` is called on app boot to restore the session (see
// `src/App.jsx`). For a logged-out visitor this 401 is expected; redirecting
// here would create an infinite login-redirect loop.
const EXEMPT_EXACT = ['/users/me'];

// How long to suppress duplicate redirects after handling a 401. Long enough
// to absorb a burst of concurrent requests failing together (e.g.
// `useDashboard`'s 6-request `Promise.all`), short enough that a *later*
// session expiry (after the user logs back in) is handled too.
const REDIRECT_SUPPRESS_MS = 3000;

let redirecting = false;

function isExemptUrl(requestUrl) {
  if (!requestUrl) return false;
  if (EXEMPT_EXACT.includes(requestUrl)) return true;
  return EXEMPT_PREFIXES.some((prefix) => requestUrl.startsWith(prefix));
}

/**
 * Handle a 401 response: log out, notify the user, and redirect to login.
 * No-op for exempt endpoints (auth flows, session-restore) and while a
 * redirect from a previous 401 is still in flight.
 *
 * @param {string | undefined} requestUrl - relative request URL (no baseURL)
 */
export function handleSessionExpired(requestUrl, code) {
  if (isExemptUrl(requestUrl) || isGoogleCredentialRecheck(requestUrl, code) || redirecting) return;

  redirecting = true;
  useAuthStore.getState().logout();
  toast.error('세션이 만료되었습니다. 다시 로그인해주세요.');

  // Clearing the user already makes ProtectedRoute redirect to /login, and
  // that redirect wins the race against this one — so no query string is
  // attached here, it would just be silently dropped. This call still matters
  // for a 401 raised somewhere ProtectedRoute would not re-render.
  navigateTo('/login', { replace: true });

  setTimeout(() => {
    redirecting = false;
  }, REDIRECT_SUPPRESS_MS);
}
