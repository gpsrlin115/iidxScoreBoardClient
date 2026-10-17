export const CATEGORIES = ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOFLAN'];
export const categoryLabel = (value) => value === 'SOFLAN' ? 'SOF-LAN' : value;
export const CATEGORY_DESCRIPTIONS = {
  NOTES: '평균밀도', CHORD: '동시치기', PEAK: '순간밀도',
  CHARGE: '차지·스핀', SCRATCH: '스크래치', SOFLAN: '변속',
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
export const dateLabel = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};
export const rankTitle = (value) => TITLES.find(([threshold]) => Number(value) >= threshold)?.[1] ?? '없음';
export const nextThreshold = (value) => [...TITLES].reverse().find(([threshold]) => threshold > Number(value))?.[0] ?? null;
export const normalizeCategory = (value) => String(value ?? '').replaceAll('-', '').toUpperCase();

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
    goals: Array.isArray(raw.goals) ? raw.goals : [],
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

export function requestFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== null));
}

export function parseExScore(value, noteCount) {
  if (!/^\d+$/.test(String(value))) return null;
  const score = Number(value);
  return Number.isSafeInteger(score) && score >= 0
    && (!finiteNumber(noteCount) || score <= Number(noteCount) * 2) ? score : null;
}

export function goalTargets(goals) {
  const targets = new Map();
  goals.forEach((goal) => {
    const score = parseExScore(goal.targetExScore);
    if (goal.chartId != null && score !== null) {
      const previous = targets.get(String(goal.chartId));
      if (!previous || previous.exScore < score) targets.set(String(goal.chartId), { chartId: goal.chartId, exScore: score });
    }
  });
  return [...targets.values()];
}

export function goalStatus(goal) {
  if (goal.achieved === true || goal.status === 'ACHIEVED') return '달성';
  if (goal.status === 'UNVERIFIED') return '확인할 기록 없음';
  if (goal.status === 'UNAVAILABLE') return '보면 데이터 확인 필요';
  if (goal.status === 'IN_PROGRESS' || goal.achieved === false) return '도전 중';
  return '달성 여부 미확인';
}

export function errorMessage(error) {
  return error?.appError?.message ?? error?.response?.data?.message ?? error?.message ?? '요청을 처리하지 못했습니다.';
}
