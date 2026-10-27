import { formatDateTime } from '../../i18n/format.js';

export const CATEGORIES = ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOFLAN'];
export const categoryLabel = (value) => value === 'SOFLAN' ? 'SOF-LAN' : value;
export const CATEGORY_DESCRIPTIONS = {
  NOTES: '평균밀도', CHORD: '동시치기', PEAK: '순간밀도',
  CHARGE: '차지 계열', SCRATCH: '스크래치', SOFLAN: '변속',
};

const TITLES = [
  [180, 'RESIDENT'], [165, 'MASTER'], [150, 'PLATINUM'], [120, 'DIAMOND'],
  [100, 'EMERALD'], [80, 'GOLD'], [50, 'SILVER'], [30, 'BRONZE'],
  [20, 'NORMAL'], [10, 'ROOKIE'], [0, '없음'],
];

export const finiteNumber = (value) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
export const number = (value) => finiteNumber(value) ? Number(value) : null;
export const decimal = (value) => finiteNumber(value) ? Number(value).toFixed(2) : '—';
export const signed = (value) => finiteNumber(value) ? `${Number(value) > 0 ? '+' : ''}${decimal(value)}` : '—';
export function scoreRate(exScore, noteCount) {
  if (!finiteNumber(exScore) || !finiteNumber(noteCount) || Number(noteCount) <= 0) return null;
  return Math.floor(Number(exScore) * 10000 / (Number(noteCount) * 2)) / 100;
}
export const dateLabel = (value) => (value && formatDateTime(value)) || '기록 없음';
export const rankTitle = (value) => finiteNumber(value) ? TITLES.find(([threshold]) => Number(value) >= threshold)?.[1] ?? '없음' : '확인 필요';
export const nextThreshold = (value) => finiteNumber(value) ? [...TITLES].reverse().find(([threshold]) => threshold > Number(value))?.[0] ?? null : null;
export const normalizeCategory = (value) => String(value ?? '').replaceAll('-', '').toUpperCase();

export function numericId(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeGoal(goal) {
  return { ...goal, id: numericId(goal.id), chartId: numericId(goal.chartId), targetExScore: number(goal.targetExScore) };
}

export function normalizeSummary(raw = {}) {
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  return {
    ...raw,
    categories: CATEGORIES.map((category) => {
      const item = categories.find((entry) => normalizeCategory(entry.category) === category) ?? {};
      return {
        ...item, category, current: number(item.current), previous: number(item.previous),
        delta: number(item.delta), title: item.title ?? rankTitle(item.current),
        nextThreshold: item.nextThreshold === null ? null : number(item.nextThreshold) ?? nextThreshold(item.current),
        complete: item.complete === true, top10: Array.isArray(item.top10) ? item.top10 : [],
        issues: Array.isArray(item.issues) ? item.issues : [],
      };
    }),
    goals: Array.isArray(raw.goals) ? raw.goals.map(normalizeGoal) : [],
  };
}

export function normalizeRecommendations(raw = {}) {
  return {
    ...raw,
    recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : [],
    exploration: Array.isArray(raw.exploration) ? raw.exploration : [],
    issues: Array.isArray(raw.issues) ? raw.issues : [],
  };
}

export function requestFilters(filters = {}) {
  const result = {};
  if (CATEGORIES.includes(filters.category)) result.category = filters.category;
  if (finiteNumber(filters.level) && Number.isInteger(Number(filters.level)) && Number(filters.level) >= 1 && Number(filters.level) <= 12) result.level = Number(filters.level);
  if (['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA'].includes(filters.chartType)) result.chartType = filters.chartType;
  if (['present', 'absent'].includes(filters.record)) result.record = filters.record;
  if (finiteNumber(filters.goal) && Number(filters.goal) >= 0) result.goal = Number(filters.goal);
  return result;
}

export function parseExScore(value, noteCount) {
  if (!/^\d+$/.test(String(value))) return null;
  const score = Number(value);
  return Number.isSafeInteger(score) && score >= 0
    && (!finiteNumber(noteCount) || score <= Number(noteCount) * 2) ? score : null;
}

// The chart left the current release catalog after the goal was saved. The server then
// rejects simulating or saving it, and cannot mark it achieved until the chart returns.
export function goalUnavailable(goal) {
  return goal?.status === 'UNAVAILABLE';
}

export function goalTargets(goals) {
  const targets = new Map();
  goals.forEach((goal) => {
    // One unavailable chart makes the server reject the whole combined simulation.
    if (goalUnavailable(goal)) return;
    const score = parseExScore(goal.targetExScore);
    const chartId = numericId(goal.chartId);
    if (chartId !== null && score !== null) {
      const previous = targets.get(chartId);
      if (!previous || previous.exScore < score) targets.set(chartId, { chartId, exScore: score });
    }
  });
  return [...targets.values()];
}

export function goalStatus(goal) {
  if (goal.status === 'ACHIEVED' || goal.achieved === true) return '달성';
  if (goalUnavailable(goal)) return '보면 데이터 확인 필요';
  return '확인 필요';
}

export function errorMessage(error) {
  const status = error?.response?.status ?? error?.appError?.status;
  const code = error?.response?.data?.code ?? error?.appError?.code ?? error?.code ?? '';
  const known = {
    NOTE_RADAR_DISABLED: '노트레이더 기능이 아직 활성화되지 않았습니다.',
    FEATURE_DISABLED: '노트레이더 기능이 아직 활성화되지 않았습니다.',
    IIDX_ID_REQUIRED: '먼저 IIDX 코드를 연결해 주세요.',
    IIDX_CODE_REQUIRED: '먼저 IIDX 코드를 연결해 주세요.',
    IIDX_ID_MISMATCH: '연결된 IIDX 코드와 공식 기록의 계정이 다릅니다.',
    IMPORT_ACCOUNT_MISMATCH: '연결된 IIDX 코드와 공식 기록의 계정이 다릅니다.',
    IMPORT_EXPIRED: '가져오기 시도가 만료되었습니다. 다시 시작해 주세요.',
    UNAUTHORIZED: '로그인이 필요합니다. 다시 로그인해 주세요.',
  };
  let fixed = known[code];
  if (!fixed && /DISABLED|NOT_ENABLED/.test(code)) fixed = known.NOTE_RADAR_DISABLED;
  if (!fixed && /MISMATCH/.test(code)) fixed = known.IMPORT_ACCOUNT_MISMATCH;
  if (!fixed && /EXPIRED/.test(code)) fixed = known.IMPORT_EXPIRED;
  if (!fixed && /IIDX.*(?:REQUIRED|NOT_LINKED|NOT_BOUND)/.test(code)) fixed = known.IIDX_ID_REQUIRED;
  if (status === 401) fixed = known.UNAUTHORIZED;
  if (status >= 500) return fixed ?? '서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  const server = status >= 400 && status < 500 && typeof error?.response?.data?.message === 'string'
    ? error.response.data.message.trim().slice(0, 300) : '';
  if (fixed) return server && server !== fixed ? `${fixed} ${server}` : fixed;
  return error?.appError?.message ?? (server || '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
}
