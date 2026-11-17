import { finiteNumber, numericId, parseExScore } from './model.js';

export const MAX_BUNDLE = 50;

const toItem = (source, exScore, origin) => ({
  chartId: source.chartId, title: source.title, chartType: source.chartType, level: source.level,
  noteCount: source.noteCount, exScore, input: String(exScore), origin,
});

export function initialBundle(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps.filter((step) => step && finiteNumber(step.targetExScore)) : [];
  const items = [];
  steps.forEach((step) => {
    if (items.length < MAX_BUNDLE && !items.some((item) => item.chartId === step.chartId)) {
      items.push(toItem(step, Number(step.targetExScore), 'plan'));
    }
  });
  return { items, edited: false, version: 0, serverPlan: plan ?? null };
}

const changed = (state, items) => ({ ...state, items, edited: true, version: state.version + 1 });

export function planBundleReducer(state, action) {
  switch (action.type) {
    case 'edit':
      return changed(state, state.items.map((item) => item.chartId === action.chartId
        ? { ...item, input: String(action.input) } : item));
    case 'remove':
      return changed(state, state.items.filter((item) => item.chartId !== action.chartId));
    case 'add': {
      const card = action.card;
      if (!card || !finiteNumber(card.targetExScore)) return state;
      const exScore = Number(card.targetExScore);
      const exists = state.items.some((item) => item.chartId === card.chartId);
      if (!exists && state.items.length >= MAX_BUNDLE) return state;
      if (exists) {
        return changed(state, state.items.map((item) => item.chartId === card.chartId
          ? { ...item, exScore, input: String(exScore) } : item));
      }
      return changed(state, [...state.items, toItem(card, exScore, 'card')]);
    }
    case 'reset': {
      const base = initialBundle(state.serverPlan);
      return { ...base, version: state.version + 1 };
    }
    default:
      return state;
  }
}

export const itemScore = (item) => parseExScore(item.input, item.noteCount);
export const isValid = (state) => state.items.length >= 1 && state.items.length <= MAX_BUNDLE
  && state.items.every((item) => itemScore(item) !== null && numericId(item.chartId) !== null);
export const size = (state) => state.items.length;
export const bundleTargets = (state) => isValid(state)
  ? state.items.map((item) => ({ chartId: numericId(item.chartId), exScore: itemScore(item) })) : null;

const samePair = (goal, chartId, category) => numericId(goal.chartId) === numericId(chartId) && goal.category === category;

export function classifySave(items, existingGoals, category) {
  return items.flatMap((item) => {
    const exScore = itemScore(item);
    if (exScore === null) return [];
    const existing = existingGoals.find((goal) => samePair(goal, item.chartId, category));
    // A stored goal without a usable target is treated as an update with an unknown previous value.
    const stored = existing && Number.isFinite(Number(existing.targetExScore)) && existing.targetExScore !== null
      ? Number(existing.targetExScore) : null;
    const kind = !existing ? 'new' : stored === null || stored < exScore ? 'raise' : stored > exScore ? 'lower' : 'same';
    return [{ chartId: item.chartId, title: item.title, chartType: item.chartType, exScore, kind,
      existing: stored, include: kind === 'new' || kind === 'raise' }];
  });
}

export const GOAL_LIMIT = 50;

export function capCheck(existingGoals, includedRows, category) {
  const added = includedRows.filter((row) => !existingGoals.some((goal) => samePair(goal, row.chartId, category))).length;
  const total = existingGoals.length + added;
  return { ok: total <= GOAL_LIMIT, total, limit: GOAL_LIMIT };
}
