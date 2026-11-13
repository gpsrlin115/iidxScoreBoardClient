// Title ladder and response-shape helpers for the synthetic note radar mock (no fixture imports).
import { TITLE_LADDER } from '../src/features/noteRadar/titles.js';

export const BOUNDS = Object.freeze({ NONE: 0, ...Object.fromEntries(TITLE_LADDER.map(({ name, bound }) => [name, bound])) });
export const round2 = (value) => Number(Number(value).toFixed(2));
// Server issue codes and their fixed sentences (RadarViews.Issue). issueCodes runs parallel to issues.
export const ISSUES = Object.freeze({
  MISSING_OFFICIAL: '공식 레이더를 먼저 가져와 주세요.',
  REPEATED_SONG: '같은 곡의 여러 난이도가 포함되어 공식 집계 규칙 확인 전 계산을 보류했습니다.',
  UNIDENTIFIED_ENTRY: '집계곡을 식별하지 못해 추천 계산을 보류했습니다.',
  OFFICIAL_ENTRIES_UNDER_10: '공식 기여곡이 10곡 미만이고 현재 곡 합계로 공식 값이 확인되지 않아 목표 도달 계산을 보류했습니다.',
  OFFICIAL_ENTRIES_OVER_10: '공식 기여곡이 10곡을 넘어 목표 도달 계산을 보류했습니다.',
  CATALOG_UNAVAILABLE: '활성 보면과 노트 수를 확인한 레이더 기준 데이터가 없습니다.',
});
export const MISSING_OFFICIAL_ISSUE = ISSUES.MISSING_OFFICIAL;
export const issue = (code, message = ISSUES[code]) => ({
  code: code.startsWith('OFFICIAL_ENTRIES_') ? 'OFFICIAL_ENTRIES_NOT_10' : code, message });

export function parseGoalTitle(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().toUpperCase();
  return Object.hasOwn(BOUNDS, name) ? name : null;
}

// Uppercase title name including NONE (the /me summary uses the Korean label instead).
export function titleOf(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const found = [...TITLE_LADDER].reverse().find(({ bound }) => Number(value) >= bound);
  return found ? found.name : 'NONE';
}

export function summaryTitle(value) {
  const name = titleOf(value);
  return name === 'NONE' ? '없음' : name;
}

// Accepts at most two decimal places once trailing zeros are dropped (4.50 passes, 4.555 is 400).
export function withinTwoDecimals(text) {
  const match = /\.(\d+)$/.exec(String(text).trim());
  return !match || match[1].replace(/0+$/, '').length <= 2;
}

// 1~9 official entries count only when their sum over ten matches the official value (RadarCalculator).
export function confirmsShortTop10(values, official) {
  if (!values.length || values.length >= 10) return false;
  const sum = values.reduce((total, value) => total + Number(value), 0);
  const close = (a, b) => Math.abs(a - b) <= 0.01 + 1e-9;
  return close(Math.floor(sum / 10 * 100) / 100, official) && !close(sum / values.length, official);
}

export function nextBound(value) {
  return TITLE_LADDER.find(({ bound }) => bound > Number(value))?.bound ?? null;
}

export function goalProgress({ requestedTitle = null, target, current = null, status }) {
  const known = current !== null;
  return { requestedTitle, targetValue: target, currentValue: current,
    currentTitle: known ? titleOf(current) : null,
    remainingGap: known ? round2(Math.max(0, target - current)) : null, status };
}

// Every recommendations response carries all 13 top-level keys. parts.issues holds issue() pairs.
// The server sends goal only for goal/goalTitle requests, and exactly those use the title plan engine.
export function envelope(category, summary, parts = {}) {
  const issues = parts.issues ?? [];
  return { category, recommendations: parts.recommendations ?? [], exploration: parts.exploration ?? [],
    issues: issues.map((item) => item.message), issueCodes: issues.map((item) => item.code),
    calculation: parts.goal ? 'TITLE_PLAN' : 'LEGACY',
    goal: parts.goal ?? null, release: summary?.release ?? '34', playStyle: 'SP',
    importedAt: summary?.importedAt ?? null, estimated: true, refreshRequired: parts.refreshRequired ?? [],
    plan: parts.plan ?? null };
}

export function missingOfficial(category, summary, goal) {
  return envelope(category, summary, { issues: [issue('MISSING_OFFICIAL')],
    goal: goal ? goalProgress({ ...goal, status: 'MISSING_OFFICIAL' }) : null });
}
