// Pure title ladder helpers shared by the model, the mock server and tests.
// Keep free of JSX, import.meta.env and imports from model.js (avoids cycles).
export const TITLE_LADDER = Object.freeze([
  ['ROOKIE', 10], ['NORMAL', 20], ['BRONZE', 30], ['SILVER', 50], ['GOLD', 80], ['EMERALD', 100],
  ['DIAMOND', 120], ['PLATINUM', 150], ['MASTER', 165], ['RESIDENT', 180],
].map(([name, bound]) => Object.freeze({ name, bound })));

const isFiniteInput = (value) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
  && Number.isFinite(Number(value));

export function titleForBound(value) {
  if (!isFiniteInput(value)) return null;
  return TITLE_LADDER.find((title) => title.bound === Number(value))?.name ?? null;
}

export function resolveGoal(input) {
  if (input === null || input === undefined || typeof input === 'string' && input.trim() === '') return { kind: 'GAIN' };
  if (!isFiniteInput(input) || Number(input) < 0 || Number(input) > 200) return { kind: 'INVALID' };
  const value = Number(input);
  const name = titleForBound(value);
  return name ? { kind: 'TITLE', goalTitle: name, value } : { kind: 'VALUE', goal: value };
}

export function nearestBound(value) {
  if (!isFiniteInput(value)) return null;
  return TITLE_LADDER.find((title) => title.bound >= Number(value))?.bound ?? null;
}

export function titleName(value) {
  if (value === null || value === undefined) return null;
  return value === 'NONE' || value === '없음' ? '없음' : value;
}

export function responseSemantics(data) {
  const requested = data?.goal?.requestedTitle;
  const plan = data?.plan;
  return typeof requested === 'string' && requested !== '' || plan !== null && typeof plan === 'object' && plan !== undefined
    ? 'PLAN' : 'LEGACY';
}

// Old servers omit the "goal" key entirely; new servers always send it (possibly null).
export const isTitleCapable = (data) => data !== null && typeof data === 'object' && Object.hasOwn(data, 'goal');
