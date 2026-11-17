// Title ladder and response-shape helpers for the synthetic note radar mock (no fixture imports).
import { TITLE_LADDER } from '../src/features/noteRadar/titles.js';

export const BOUNDS = Object.freeze({ NONE: 0, ...Object.fromEntries(TITLE_LADDER.map(({ name, bound }) => [name, bound])) });
export const round2 = (value) => Number(Number(value).toFixed(2));
export const MISSING_OFFICIAL_ISSUE = '공식 레이더를 먼저 가져와 주세요.';

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

export function nextBound(value) {
  return TITLE_LADDER.find(({ bound }) => bound > Number(value))?.bound ?? null;
}

export function goalProgress({ requestedTitle = null, target, current = null, status }) {
  const known = current !== null;
  return { requestedTitle, targetValue: target, currentValue: current,
    currentTitle: known ? titleOf(current) : null,
    remainingGap: known ? round2(Math.max(0, target - current)) : null, status };
}

// Every recommendations response carries all 11 top-level keys.
export function envelope(category, summary, parts = {}) {
  return { category, recommendations: parts.recommendations ?? [], exploration: parts.exploration ?? [],
    issues: parts.issues ?? [], goal: parts.goal ?? null, release: summary?.release ?? '34', playStyle: 'SP',
    importedAt: summary?.importedAt ?? null, estimated: true, refreshRequired: parts.refreshRequired ?? [],
    plan: parts.plan ?? null };
}

export function missingOfficial(category, summary, goal) {
  return envelope(category, summary, { issues: [MISSING_OFFICIAL_ISSUE],
    goal: goal ? goalProgress({ ...goal, status: 'MISSING_OFFICIAL' }) : null });
}
