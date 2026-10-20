import { toAppError } from './httpError.js';

// Every time in the request budget response is a UTC instant ("...Z").
const OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;

function parseInstant(value) {
  if (typeof value !== 'string' || !OFFSET.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatIn(timeZone, value) {
  const ms = parseInstant(value);
  if (ms == null) return null;
  // sv-SE gives "YYYY-MM-DD HH:mm:ss", which reads the same in Korean UI.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(ms));
}

/** Korea time, the zone admins read. null for missing or offsetless values. */
export const formatKst = (value) => formatIn('Asia/Seoul', value);

/** The same instant as the server stores it, shown next to KST. */
export const formatUtc = (value) => formatIn('UTC', value);

/**
 * Time left until `untilIso`, for display only. Whether a block is active is
 * the server's `blocked` field, never this browser clock.
 */
export function formatRemaining(untilIso, nowMs = Date.now()) {
  const until = parseInstant(untilIso);
  if (until == null || until <= nowMs) return null;
  const minutes = Math.floor((until - nowMs) / 60000);
  if (minutes < 1) return '1분 미만';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days && `${days}일`, hours && `${hours}시간`, rest && `${rest}분`].filter(Boolean).join(' ');
}

export function usageText(used, budget) {
  const show = (value) => (Number.isFinite(value) ? value.toLocaleString('ko-KR') : '-');
  return `${show(used)} / ${show(budget)}`;
}

export const BUDGET_NOT_SUPPORTED = '서버가 이 기능을 아직 지원하지 않습니다. 백엔드 배포 상태를 확인해주세요.';
export const BUDGET_FORBIDDEN = '관리자 권한이 필요합니다.';

/**
 * Fixed copy for the two expected refusals; anything else follows the app's
 * usual `toAppError` policy (server text for 4xx, fixed copy for 5xx/network).
 * 404 means the backend with this API is not deployed yet.
 */
export function budgetErrorMessage(error) {
  const status = error?.response?.status ?? null;
  if (status === 404) return BUDGET_NOT_SUPPORTED;
  if (status === 403) return BUDGET_FORBIDDEN;
  return (error?.appError ?? toAppError(error)).message;
}
