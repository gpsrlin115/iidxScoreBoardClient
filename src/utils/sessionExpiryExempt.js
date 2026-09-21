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
const EXEMPT_EXACT = [
  '/users/me',
  // Older servers return 401 because Google provider discovery and CSRF
  // bootstrap are unavailable. That describes feature support, not session state.
  '/auth/providers',
  '/csrf',
];

export function isSessionExpiryExempt(requestUrl) {
  if (!requestUrl) return false;
  if (EXEMPT_EXACT.includes(requestUrl)) return true;
  return EXEMPT_PREFIXES.some((prefix) => requestUrl.startsWith(prefix));
}
