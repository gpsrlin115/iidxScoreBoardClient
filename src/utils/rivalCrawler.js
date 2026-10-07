export const STATUS_LABELS = Object.freeze({
  QUEUED: '대기 중',
  RUNNING: '수집 중',
  DONE: '목록 수집 완료',
  PARTIAL: '일부 기록이 저장됐을 수 있습니다',
  FAILED: '수집 실패',
  CANCELLED: '취소됨',
});

export const TERMINAL_STATUS_EXPLANATIONS = Object.freeze({
  DONE: '이번 수집은 MISS COUNT를 갱신하지 않으며 기존 기록은 유지됩니다.',
  PARTIAL: '수집이 중단됐습니다. 일부 기록이 저장됐을 수 있으며 기존 MISS COUNT는 유지됩니다.',
  FAILED: '수집이 실패했습니다. 기존 기록은 유지됩니다.',
  CANCELLED: '작업이 취소됐습니다. 이미 저장한 기록은 삭제되지 않습니다.',
});

const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);
const TERMINAL_STATUSES = new Set(['DONE', 'PARTIAL', 'FAILED', 'CANCELLED']);

export function isActiveJob(job) {
  return ACTIVE_STATUSES.has(job?.status);
}

export function isTerminalJob(job) {
  return TERMINAL_STATUSES.has(job?.status);
}

const CODE_MESSAGES = Object.freeze({
  RIVAL_COLLECTION_DISABLED: '내 기록 수집 기능이 비활성화되어 있습니다. CSV 업로드나 북마클릿을 이용해주세요.',
  IIDX_ID_NOT_VERIFIED: '먼저 본인 e-amusement 프로필에서 IIDX 코드를 확인해주세요.',
  IIDX_ID_ALREADY_LINKED: '이 IIDX 코드는 다른 계정에 연결되어 있습니다. 본인 코드를 확인해주세요.',
  VERIFICATION_RATE_LIMIT: '본인 확인 횟수 한도에 도달했습니다. 잠시 후 상태를 다시 확인해주세요.',
  VERIFICATION_SUPERSEDED: '확인 요청 상태가 변경됐습니다. 연결 상태를 다시 조회해주세요.',
  COLLECTION_ACTIVE: '이미 진행 중인 내 기록 수집 작업이 있습니다.',
  IIDX_BINDING_STALE: '본인 코드 연결 상태가 바뀌었습니다. 연결 상태를 다시 확인해주세요.',
  OPERATOR_SESSION_UNAVAILABLE: '수집 서버 세션을 사용할 수 없습니다. 잠시 후 다시 확인해주세요.',
  OPERATOR_TARGET_CONFLICT: '수집 서버의 대상 정보와 작업이 일치하지 않습니다. 관리자 확인이 필요합니다.',
  INVALID_VERIFICATION_INPUT: '본인 확인 쿠키 입력을 확인해주세요.',
});

const STATUS_MESSAGES = Object.freeze({
  400: '입력 내용을 확인해주세요.',
  401: '로그인이 만료됐습니다. 다시 로그인해주세요.',
  403: '요청 권한이 없거나 보안 토큰이 만료됐습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.',
  404: '내 기록 수집 작업 조회 API를 찾을 수 없습니다. 백엔드 배포 상태를 확인해주세요.',
  409: '현재 상태가 변경됐습니다. 연결 또는 작업 상태를 다시 조회해주세요.',
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

/** Return safe, fixed Korean copy; server messages are intentionally not shown. */
export function classifyRivalError(error, operation = 'request', nowMs = Date.now()) {
  const status = error?.response?.status ?? error?.status ?? null;
  const body = error?.response?.data ?? error?.data;
  const code = typeof body?.code === 'string'
    ? body.code
    : typeof body?.error === 'string'
      ? body.error
      : null;

  let message = CODE_MESSAGES[code] || STATUS_MESSAGES[status] || '요청을 처리하지 못했습니다. 상태를 다시 조회한 뒤 필요하면 다시 시도해주세요.';
  if (status === 404 && operation === 'cancel') {
    message = '취소할 활성 작업을 찾지 못했습니다. 현재 작업 상태를 다시 조회해주세요.';
  } else if (status === 404 && operation !== 'status' && operation !== 'getStatus') {
    message = '요청한 내 기록 수집 API를 찾을 수 없습니다. 백엔드 배포 상태를 확인해주세요.';
  }

  return {
    status,
    code,
    message,
    retryAfterSeconds: status === 429 ? readRetryAfter(error?.response?.headers ?? error?.headers, nowMs) : null,
  };
}

/** LocalDateTime values have no zone. Preserve their literal wall-clock fields. */
export function formatServerTime(value) {
  if (typeof value !== 'string' || !value) return null;
  return value.replace('T', ' ');
}
