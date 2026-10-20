export const STATUS_LABELS = Object.freeze({
  QUEUED: '대기 중',
  RUNNING: '수집 중',
  DONE: '목록 수집 완료',
  PARTIAL: '일부 시리즈 저장',
  FAILED: '수집 실패',
  CANCELLED: '취소됨',
});

// Rival collection walks the series of the current work, one list page each.
export const SERIES_TOTAL = 34;
// The server opens the next request this long after the last job ends.
export const COOLDOWN_MINUTES = 60;

export const TERMINAL_STATUS_EXPLANATIONS = Object.freeze({
  DONE: '이번 수집은 MISS COUNT를 갱신하지 않으며 기존 기록은 유지됩니다.',
  PARTIAL: `저장한 시리즈는 유지됩니다. ${COOLDOWN_MINUTES}분 뒤 다시 요청하면 남은 시리즈만 받습니다. 기존 MISS COUNT는 유지됩니다.`,
  FAILED: '수집이 실패했습니다. 기존 기록은 유지됩니다.',
  CANCELLED: '작업이 취소됐습니다. 이미 저장한 기록은 삭제되지 않습니다.',
});

/**
 * "N of 34 series saved" for a PARTIAL job. The server's own errorMessage is an
 * English code sentence ("Rival collection stored N of 34 series (CODE).") and is
 * never shown; pagesDone already counts series kept from earlier resumed runs.
 */
export function partialMessage(job) {
  const total = Number.isFinite(job?.pagesTotal) && job.pagesTotal > 0 ? job.pagesTotal : SERIES_TOTAL;
  const saved = Number.isFinite(job?.pagesDone) ? `${job.pagesDone}개` : '일부';
  return `${total}개 시리즈 중 ${saved}를 저장했습니다. ${COOLDOWN_MINUTES}분 뒤 다시 요청하면 남은 시리즈만 받습니다.`;
}

// Server waitingReason codes with copy. Unknown codes are hidden, never shown raw.
export const WAITING_REASON_LABELS = Object.freeze({
  LIST_REPEAT: 'e-amusement가 일부 목록을 늦게 보내 다시 확인하는 중',
});

export const waitingReasonText = (code) => WAITING_REASON_LABELS[code] ?? null;

/** Styles a collection request may carry, in the order the server runs them. */
export const PLAY_STYLES = Object.freeze(['SP', 'DP']);
export const DEFAULT_PLAY_STYLES = PLAY_STYLES;

/**
 * Only SP and/or DP, each once, SP first; null for anything else. The server
 * answers other values with INVALID_VERIFICATION_INPUT, whose copy is about
 * cookies, so a bad selection must never reach it.
 */
export function normalizePlayStyles(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > PLAY_STYLES.length) return null;
  if (new Set(value).size !== value.length || !value.every((style) => PLAY_STYLES.includes(style))) return null;
  return PLAY_STYLES.filter((style) => value.includes(style));
}

// Where a binding came from. The server fixes this; the client never sends it.
export const SOURCE_LABELS = Object.freeze({
  BOOKMARKLET: '북마클릿',
  EAGATE_SESSION: '쿠키 확인',
});

const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);
const TERMINAL_STATUSES = new Set(['DONE', 'PARTIAL', 'FAILED', 'CANCELLED']);

export function isActiveJob(job) {
  return ACTIVE_STATUSES.has(job?.status);
}

export function isTerminalJob(job) {
  return TERMINAL_STATUSES.has(job?.status);
}

/**
 * Jobs of the latest request, SP first. A server with SP·DP support always sends
 * `jobs` (an empty array when there is none); only an older server leaves it out,
 * and then `latestJob` is the whole request.
 */
export function requestJobs(status) {
  if (Array.isArray(status?.jobs)) return status.jobs;
  return status?.latestJob ? [status.latestJob] : [];
}

/** Still running while any job of the request is queued or running (SP DONE + DP RUNNING is active). */
export const isRequestActive = (status) => requestJobs(status).some(isActiveJob);

/** Finished only when every job of the request has ended. */
export function isRequestTerminal(status) {
  const jobs = requestJobs(status);
  return jobs.length > 0 && jobs.every(isTerminalJob);
}

/** Identifies one request, so "finished" is announced once per request, not once per job. */
export const requestKey = (status) => requestJobs(status).map((job) => job.id).join(',');

const IIDX_ID_FORMAT = /^(?:\d{8}|\d{4}-\d{4})$/;

/** Server-accepted shapes only (12345678 or 1234-5678), returned as 1234-5678. */
export function normalizeIidxId(value) {
  if (typeof value !== 'string' || !IIDX_ID_FORMAT.test(value)) return null;
  const digits = value.replace('-', '');
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/**
 * A binding that may collect: REGISTERED (bookmarklet) or VERIFIED (cookie).
 * `verified` is accepted too because a server without the `registered` field
 * only ever reports verified bindings, and those could already collect.
 * PENDING and REVOKED bindings carry no iidxId, so they never pass.
 */
export function isLinkedBinding(binding) {
  return Boolean(normalizeIidxId(binding?.iidxId))
    && (binding.registered === true || binding.verified === true);
}

/** The binding shape after unlink or before the first read. */
export const EMPTY_BINDING = Object.freeze({
  iidxId: null, verified: false, verifiedAt: null, registered: false, source: null, registeredAt: null,
});

const CODE_MESSAGES = Object.freeze({
  RIVAL_COLLECTION_DISABLED: '내 기록 수집 기능이 꺼져 있어 IIDX 코드 연결과 수집을 할 수 없습니다. CSV 업로드를 이용해주세요.',
  // The server kept this name for compatibility; it now means "no linked IIDX ID".
  IIDX_ID_NOT_VERIFIED: '연결된 IIDX 코드가 없습니다. 먼저 IIDX 코드를 연결해주세요.',
  IIDX_ID_ALREADY_LINKED: '이 IIDX 코드는 다른 계정에서 쿠키로 확인했습니다. 본인 코드인지 확인해주세요.',
  VERIFICATION_RATE_LIMIT: '본인 확인 횟수 한도에 도달했습니다. 잠시 후 상태를 다시 확인해주세요.',
  VERIFICATION_SUPERSEDED: '확인 요청 상태가 변경됐습니다. 연결 상태를 다시 조회해주세요.',
  COLLECTION_ACTIVE: '이미 진행 중인 내 기록 수집 작업이 있습니다.',
  IIDX_BINDING_STALE: '본인 코드 연결 상태가 바뀌었습니다. 연결 상태를 다시 확인해주세요.',
  OPERATOR_SESSION_UNAVAILABLE: '수집 서버 세션을 사용할 수 없습니다. 잠시 후 다시 확인해주세요.',
  OPERATOR_TARGET_CONFLICT: '수집 서버의 대상 정보와 작업이 일치하지 않습니다. 관리자 확인이 필요합니다.',
  INVALID_VERIFICATION_INPUT: '본인 확인 쿠키 입력을 확인해주세요.',
  // Bookmarklet registration (/crawler/iidx/bookmarklet/me). Bodies are {code, message, retryAt?}.
  INVALID_IIDX_ID: '프로필에서 읽은 IIDX 코드 형식이 올바르지 않아 이번 시도가 끝났습니다. 원래 화면에서 연결을 다시 시작해주세요.',
  INVALID_REGISTRATION_INPUT: '연결 요청 형식이 올바르지 않습니다. 원래 화면에서 연결을 다시 시작해주세요.',
  SITE_LOGIN_REQUIRED: '사이트에 다시 로그인해야 합니다. 로그인한 뒤 연결을 처음부터 시작해주세요.',
  CSRF_FORBIDDEN: '보안 토큰이 만료됐습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.',
  FORBIDDEN: '이 요청을 처리할 권한이 없습니다.',
  IIDX_ALREADY_REGISTERED: '이 계정에는 이미 IIDX 코드가 연결돼 있습니다. 코드를 바꾸려면 연결을 해제한 뒤 다시 등록해주세요.',
  REGISTRATION_SUPERSEDED: '이 연결 시도는 더 이상 쓸 수 없습니다. 새로 시작했거나, 연결을 해제했거나, 로그아웃한 경우입니다. 연결 상태를 확인한 뒤 필요하면 다시 시작해주세요.',
  REGISTRATION_ALREADY_CONSUMED: '이미 처리된 연결 시도입니다. 연결 결과를 다시 확인해주세요.',
  REGISTRATION_EXPIRED: '연결 시도 시간(5분)이 지났습니다. 원래 화면에서 다시 시작해주세요.',
  REGISTRATION_RATE_LIMIT: '연결 시작은 한 시간에 3번까지 할 수 있습니다. 안내된 시각 이후에 다시 시작해주세요.',
});

// Same code, different advice when the failing request was a registration.
const REGISTRATION_CODE_MESSAGES = Object.freeze({
  COLLECTION_ACTIVE: '내 기록 수집이 진행 중이라 연결을 시작할 수 없습니다. 작업이 끝나거나 취소한 뒤 다시 시도해주세요.',
});

// The job endpoint reuses INVALID_VERIFICATION_INPUT for a bad playStyles body;
// its cookie wording would mislead there.
const ENQUEUE_CODE_MESSAGES = Object.freeze({
  INVALID_VERIFICATION_INPUT: '수집할 플레이 스타일(SP·DP) 선택을 확인해주세요.',
});

// Before launch the edge proxy answers POST /crawler/rival/jobs/me with 503 and
// this header; the body is not JSON.
const MAINTENANCE_HEADER = 'x-iidx-maintenance';
const CRAWLER_VALIDATION = 'crawler-validation';
const NOT_YET_OPEN_MESSAGE = '서버 수집은 아직 준비 중입니다. 공개되면 이 화면에서 요청할 수 있습니다. 지금은 CSV 업로드를 이용해주세요.';

function readHeader(headers, name) {
  if (!headers) return null;
  const value = headers[name] ?? headers.get?.(name);
  return typeof value === 'string' ? value : null;
}

// After these the local picture is stale; re-read binding and registration before advising.
export const REQUERY_CODES = Object.freeze(new Set([
  'IIDX_ALREADY_REGISTERED', 'COLLECTION_ACTIVE', 'REGISTRATION_SUPERSEDED', 'REGISTRATION_ALREADY_CONSUMED',
]));

const REGISTRATION_OPERATIONS = new Set(['register', 'complete', 'cancelRegistration']);

const STATUS_MESSAGES = Object.freeze({
  400: '입력 내용을 확인해주세요.',
  401: '로그인이 만료됐습니다. 다시 로그인해주세요.',
  403: '요청 권한이 없거나 보안 토큰이 만료됐습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.',
  404: '내 기록 수집 작업 조회 API를 찾을 수 없습니다. 백엔드 배포 상태를 확인해주세요.',
  409: '현재 상태가 변경됐습니다. 연결 또는 작업 상태를 다시 조회해주세요.',
  410: '요청한 시도가 만료됐습니다. 처음부터 다시 시작해주세요.',
  429: '요청 한도에 도달했습니다. 잠시 후 상태를 다시 확인해주세요.',
  502: 'e-amusement 프로필 확인에 실패했습니다. 사이트 로그인이 만료된 것은 아니며 잠시 후 다시 시도해주세요.',
  503: '내 기록 수집을 현재 사용할 수 없습니다. 기능 설정 또는 수집 서버 준비 상태를 확인해주세요.',
});

function readRetryAfter(headers, nowMs) {
  if (!headers) return null;
  const value = headers['retry-after'] ?? headers['Retry-After'] ?? headers.get?.('retry-after');
  if (value === undefined || value === null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, Math.ceil((dateMs - nowMs) / 1000));
}

/** Milliseconds for a UTC instant ("...Z" or with an offset); null for anything else. */
export function parseUtcInstant(value) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function alreadyRegisteredMessage(binding, submittedId) {
  const current = isLinkedBinding(binding) ? normalizeIidxId(binding.iidxId) : null;
  const submitted = normalizeIidxId(submittedId);
  if (current && submitted && current === submitted) return `이미 이 계정에 연결된 IIDX 코드(${current})입니다. 다시 등록할 필요가 없습니다.`;
  if (current) return `이 계정에는 다른 IIDX 코드(${current})가 연결돼 있습니다. 코드를 바꾸려면 연결을 해제한 뒤 다시 등록해주세요.`;
  return CODE_MESSAGES.IIDX_ALREADY_REGISTERED;
}

/**
 * Return safe, fixed Korean copy; server messages are intentionally not shown.
 * `context.binding` and `context.submittedId` only refine IIDX_ALREADY_REGISTERED.
 */
export function classifyRivalError(error, operation = 'request', nowMs = Date.now(), context = {}) {
  const status = error?.response?.status ?? error?.status ?? null;
  const body = error?.response?.data ?? error?.data;
  const headers = error?.response?.headers ?? error?.headers;
  const maintenance = status === 503 && readHeader(headers, MAINTENANCE_HEADER) === CRAWLER_VALIDATION;
  // A 429 from the job endpoint carries an English {error, message}; `error` lands
  // in `code` here but matches no copy, so the fixed 429 text is used.
  const code = maintenance
    ? 'CRAWLER_VALIDATION'
    : typeof body?.code === 'string'
      ? body.code
      : typeof body?.error === 'string'
        ? body.error
        : null;
  const registration = REGISTRATION_OPERATIONS.has(operation);

  let message = (registration && REGISTRATION_CODE_MESSAGES[code])
    || (operation === 'enqueue' && ENQUEUE_CODE_MESSAGES[code]) || CODE_MESSAGES[code]
    || STATUS_MESSAGES[status] || '요청을 처리하지 못했습니다. 상태를 다시 조회한 뒤 필요하면 다시 시도해주세요.';
  if (maintenance) {
    message = NOT_YET_OPEN_MESSAGE;
  } else if (code === 'IIDX_ALREADY_REGISTERED') {
    message = alreadyRegisteredMessage(context.binding, context.submittedId);
  } else if (status === 404 && operation === 'cancel') {
    message = '취소할 활성 작업을 찾지 못했습니다. 현재 작업 상태를 다시 조회해주세요.';
  } else if (status === 404 && operation !== 'status' && operation !== 'getStatus') {
    message = '요청한 내 기록 수집 API를 찾을 수 없습니다. 백엔드 배포 상태를 확인해주세요.';
  }

  // Registration 429 carries a UTC retryAt in the body; prefer it over the header.
  const retryAtMs = status === 429 ? parseUtcInstant(body?.retryAt) : null;
  const headerSeconds = status === 429 ? readRetryAfter(headers, nowMs) : null;
  return {
    status,
    code,
    message,
    retryAt: retryAtMs,
    retryAfterSeconds: retryAtMs != null ? Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000)) : headerSeconds,
    // No HTTP status means the request may or may not have reached the server.
    responseLost: status == null,
  };
}

/** LocalDateTime values have no zone. Preserve their literal wall-clock fields. */
export function formatServerTime(value) {
  if (typeof value !== 'string' || !value) return null;
  return value.replace('T', ' ');
}

/**
 * UTC instants (registeredAt, expiresAt, retryAt) shown in the viewer's zone.
 * Kept apart from formatServerTime: verifiedAt has no offset and must not be shifted.
 */
export function formatUtcTime(value, timeZone) {
  const ms = parseUtcInstant(value);
  if (ms == null) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(ms));
}
