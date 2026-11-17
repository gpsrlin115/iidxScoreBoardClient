/**
 * HTTP error normalization layer.
 *
 * Every caught request error (axios or plain) should be passed through
 * `toAppError()` so the rest of the app deals with a single predictable
 * shape instead of repeating `err.response?.data?.message || '...'` at
 * every call site.
 */

import i18n from '../i18n/index.js';

// HTTP status -> key under `errors.status` in the locale files. The copy is
// resolved when an error is built, so it follows the language active then.
const STATUS_KEYS = {
  400: 'badRequest',
  401: 'sessionExpired',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  413: 'payloadTooLarge',
  415: 'unsupportedMediaType',
  422: 'unprocessable',
  429: 'tooManyRequests',
  500: 'serverError',
  502: 'unavailable',
  503: 'unavailable',
  504: 'unavailable',
};

const NETWORK_MESSAGE = () => i18n.t('errors.network');
const TIMEOUT_MESSAGE = () => i18n.t('errors.timeout');
const UNKNOWN_MESSAGE = () => i18n.t('errors.unknown');

// Server error codes become part of a translation key, so only plain
// identifiers are accepted. "a.b" or "../x" must never reach i18next.
const SERVER_CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Best-effort extraction of a server-provided message from a response body.
 * Handles the standard Spring Boot `{ message }` shape, plus a plain string
 * body or a `{ error }`-only body, defensively.
 *
 * @param {unknown} data - `error.response.data`
 * @returns {string | null}
 */
function extractServerMessage(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (typeof data.message === 'string' && data.message) return data.message;
  if (typeof data.error === 'string' && data.error) return data.error;
  return null;
}

function statusFallbackMessage(status) {
  const key = STATUS_KEYS[status];
  return key ? i18n.t(`errors.status.${key}`) : UNKNOWN_MESSAGE();
}

/**
 * The machine-readable `code` of a `{ error, message, code?, params? }` error
 * body, or null. Distinct from the axios `error.code` ("ERR_NETWORK").
 *
 * @param {unknown} data - `error.response.data`
 * @returns {string | null}
 */
function extractServerCode(data) {
  const code = data?.code;
  return typeof code === 'string' && SERVER_CODE_PATTERN.test(code) ? code : null;
}

/**
 * Translates a server error code with its interpolation params, or returns
 * null when this client has no `errors.server.<code>` entry for it (older
 * client, newer server) so the caller can fall back to the server message.
 *
 * Params are server data: only strings, numbers and booleans are used, and
 * they are passed as `replace` values so a param named like an i18next option
 * ("lng", "ns", "defaultValue") cannot change how the lookup behaves. `count`
 * is the one exception because it drives plural selection.
 *
 * @param {unknown} data - `error.response.data`
 * @returns {string | null}
 */
function translateServerCode(data) {
  const code = extractServerCode(data);
  if (!code) return null;
  const key = `errors.server.${code}`;

  const replace = {};
  let count;
  if (data.params && typeof data.params === 'object') {
    for (const [name, value] of Object.entries(data.params)) {
      if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
      if (name === 'count' && typeof value === 'number') count = value;
      else replace[name] = value;
    }
  }
  // `replace` stands in for the interpolation data, so `count` has to be in it
  // as well as in the options that pick the plural form.
  const options = count === undefined ? { replace } : { replace: { ...replace, count }, count };
  // `count` is part of the existence check because plural entries are stored
  // as `<key>_one` / `<key>_other`, never under the bare key.
  return i18n.exists(key, count === undefined ? undefined : { count }) ? i18n.t(key, options) : null;
}

/**
 * Normalize any request error into a single predictable shape.
 *
 * Message source policy:
 * - 4xx: prefer this client's translation of the server's `code` (with its
 *   `params`), then the server's `message` (useful validation feedback), then
 *   the caller-supplied `fallback`, then a status-keyed default. The code is
 *   only trusted when `errors.server.<code>` exists, so a server that is ahead
 *   of this client degrades to the message it always sent.
 * - 5xx / network / timeout: NEVER use the server message — Spring Boot's
 *   default error body can leak internal paths or exception details. Always
 *   use fixed copy instead.
 * - Plain (non-axios) errors have no `response`, so `status` is `null` and
 *   there is nothing server-side to leak; `fallback` is honored here.
 *
 * @param {unknown} error - the caught error (axios error or plain Error)
 * @param {{ fallback?: string }} [options]
 * @returns {{
 *   status: number | null,
 *   code: string | null,
 *   serverCode: string | null,
 *   message: string,
 *   serverMessage: string | null,
 *   retryable: boolean,
 *   raw: unknown,
 * }}
 */
export function toAppError(error, { fallback } = {}) {
  const status = error?.response?.status ?? null;
  const code = error?.code ?? null;
  const serverMessage = extractServerMessage(error?.response?.data);
  const serverCode = extractServerCode(error?.response?.data);

  let message;
  if (status === null) {
    if (code === 'ECONNABORTED') {
      message = TIMEOUT_MESSAGE();
    } else if (code === 'ERR_NETWORK') {
      message = NETWORK_MESSAGE();
    } else {
      message = fallback || UNKNOWN_MESSAGE();
    }
  } else if (status >= 500) {
    message = statusFallbackMessage(status);
  } else {
    message = translateServerCode(error.response.data)
      || serverMessage || fallback || statusFallbackMessage(status);
  }

  return {
    status,
    code,
    serverCode,
    message,
    serverMessage,
    retryable: status === null || status >= 500 || status === 429,
    raw: error,
  };
}
