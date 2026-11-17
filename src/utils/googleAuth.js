import i18n from '../i18n/index.js';

// Codes the server (or the OAuth callback query string) may send. Copy lives in
// the locale files under `auth.google.errors.<CODE>`; this list is the allowlist
// that keeps an unknown or hostile code from ever becoming a lookup key.
const ERROR_CODES = Object.freeze([
  'GOOGLE_DISABLED',
  'ENROLLMENT_DISABLED',
  'AUTH_REQUIRED',
  'INVALID_CREDENTIALS',
  'ALREADY_LINKED',
  'GOOGLE_ALREADY_LINKED',
  'ACCOUNT_CONFLICT',
  'EMAIL_CONFLICT',
  'USERNAME_CONFLICT',
  'PASSWORD_EXISTS',
  'INVALID_USERNAME',
  'INVALID_PASSWORD',
  'GOOGLE_NOT_LINKED',
  'WRONG_GOOGLE_ACCOUNT',
  'FLOW_EXPIRED',
  'FLOW_INVALID',
  'GOOGLE_CANCELLED',
  'GOOGLE_FAILED',
]);

const errorMessage = (code) => i18n.t(`auth.google.errors.${code}`);

export function googleAuthError(error) {
  const rawCode = typeof error === 'string' ? error : error?.response?.data?.code;
  const status = error?.response?.status;
  const code = ERROR_CODES.includes(rawCode) ? rawCode
    : status === 401 ? 'AUTH_REQUIRED' : status === 410 ? 'FLOW_EXPIRED' : 'GOOGLE_FAILED';
  const message = status === 429
    ? i18n.t('auth.google.tooManyRequests')
    : errorMessage(code);
  return { code, message };
}

export function isGoogleCredentialRecheck(requestUrl, code) {
  return requestUrl === '/auth/google/start' && code === 'INVALID_CREDENTIALS';
}

export function googleProtectedRedirect(pathname, search) {
  if (pathname !== '/profile') return '/login';
  const params = new URLSearchParams(search);
  const callbackError = params.get('googleError');
  if (callbackError) return `/login?googleError=${googleAuthError(callbackError).code}`;
  return params.get('google') === 'pending' ? '/login?googleError=AUTH_REQUIRED' : '/login';
}

export function googleUsernameError(username) {
  const length = username.trim().length;
  return length < 3 || length > 50 ? errorMessage('INVALID_USERNAME') : '';
}

export function googlePasswordError(password, confirmation) {
  if (password.length < 8) return errorMessage('INVALID_PASSWORD');
  return password !== confirmation ? i18n.t('auth.google.passwordMismatch') : '';
}

export function isGooglePendingValid(pending, intents, now = Date.now()) {
  return intents.includes(pending?.intent)
    && typeof pending?.email === 'string'
    && Number.isFinite(Date.parse(pending?.expiresAt))
    && Date.parse(pending.expiresAt) > now;
}

export const ENDED_GOOGLE_FLOWS = new Set([
  'FLOW_EXPIRED', 'FLOW_INVALID', 'AUTH_REQUIRED', 'EMAIL_CONFLICT',
  'ENROLLMENT_DISABLED', 'GOOGLE_DISABLED', 'GOOGLE_ALREADY_LINKED',
  'WRONG_GOOGLE_ACCOUNT', 'PASSWORD_EXISTS', 'ALREADY_LINKED',
  'ACCOUNT_CONFLICT',
]);

// Read the cookie after this request; the JSON token can be XOR encoded.
export async function postGoogleWithCsrf(client, path, data) {
  await client.get('/csrf');
  const response = await client.post(path, data);
  return response.data;
}
