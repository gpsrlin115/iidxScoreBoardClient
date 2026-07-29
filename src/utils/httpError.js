/**
 * HTTP error normalization layer.
 *
 * Every caught request error (axios or plain) should be passed through
 * `toAppError()` so the rest of the app deals with a single predictable
 * shape instead of repeating `err.response?.data?.message || '...'` at
 * every call site.
 */

// Default Korean copy shown to the user, keyed by HTTP status code.
export const STATUS_MESSAGES = {
  400: '요청 내용을 다시 확인해주세요.',
  401: '세션이 만료되었습니다. 다시 로그인해주세요.',
  403: '이 페이지에 접근할 권한이 없습니다.',
  404: '요청하신 정보를 찾을 수 없습니다.',
  409: '이미 존재하는 데이터입니다.',
  413: '파일 크기가 너무 큽니다.',
  415: '지원하지 않는 파일 형식입니다.',
  422: '입력값을 확인해주세요.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  500: '서버에 문제가 발생했습니다.',
  502: '서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
  503: '서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
  504: '서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
};

const NETWORK_MESSAGE = '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.';
const TIMEOUT_MESSAGE = '요청 시간이 초과되었습니다. 다시 시도해주세요.';
const UNKNOWN_MESSAGE = '알 수 없는 오류가 발생했습니다.';

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
  return STATUS_MESSAGES[status] || UNKNOWN_MESSAGE;
}

/**
 * Normalize any request error into a single predictable shape.
 *
 * Message source policy:
 * - 4xx: prefer the server's `message` (useful validation feedback), then
 *   the caller-supplied `fallback`, then a status-keyed default.
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
 *   message: string,
 *   serverMessage: string | null,
 *   fatal: boolean,
 *   retryable: boolean,
 *   raw: unknown,
 * }}
 */
export function toAppError(error, { fallback } = {}) {
  const status = error?.response?.status ?? null;
  const code = error?.code ?? null;
  const serverMessage = extractServerMessage(error?.response?.data);

  let message;
  if (status === null) {
    if (code === 'ECONNABORTED') {
      message = TIMEOUT_MESSAGE;
    } else if (code === 'ERR_NETWORK') {
      message = NETWORK_MESSAGE;
    } else {
      message = fallback || UNKNOWN_MESSAGE;
    }
  } else if (status >= 500) {
    message = statusFallbackMessage(status);
  } else {
    message = serverMessage || fallback || statusFallbackMessage(status);
  }

  return {
    status,
    code,
    message,
    serverMessage,
    fatal: status === 403 || status >= 500 || status === null,
    retryable: status === null || status >= 500 || status === 429,
    raw: error,
  };
}
