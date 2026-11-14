// Title-plan recommendation responses (goalTitle or a numeric goal) for the synthetic note radar mock.
import { CHARTS } from './note-radar-mock-data.mjs';
import { ISSUES, confirmsShortTop10, envelope, goalProgress, issue, missingOfficial, parseGoalTitle, round2,
  titleOf } from './note-radar-mock-ladder.mjs';
import { SPECS, card, extraCards, refreshCards } from './note-radar-mock-title-cards.mjs';

export { parseGoalTitle, titleOf };
export const UNDER_10_ISSUE = ISSUES.OFFICIAL_ENTRIES_UNDER_10;
export const OVER_10_ISSUE = ISSUES.OFFICIAL_ENTRIES_OVER_10;
export const UNIDENTIFIED_ISSUE = ISSUES.UNIDENTIFIED_ENTRY;
export const REPEATED_SONG_ISSUE = ISSUES.REPEATED_SONG;

// At most one blocking reason, in server order: repeated song, unidentified entry, official entries not 10.
export function blockingIssue(item) {
  const songIds = item.top10.map((entry) => entry.songId).filter((id) => id !== null && id !== undefined);
  if (new Set(songIds).size !== songIds.length) return issue('REPEATED_SONG');
  if (item.complete === false || item.top10.some((entry) => entry.chartId == null || entry.songId == null)) {
    return issue('UNIDENTIFIED_ENTRY');
  }
  const count = item.top10.length;
  if (count > 10) return issue('OFFICIAL_ENTRIES_OVER_10');
  if (count < 10 && !confirmsShortTop10(item.top10.map((entry) => entry.value), item.current)) {
    return issue('OFFICIAL_ENTRIES_UNDER_10');
  }
  return null;
}
const entryOf = (chart, value) => ({ chartId: chart.chartId, songId: chart.songId, title: chart.title,
  chartType: chart.chartType, value: round2(value) });

// Like the server, the plan only uses candidates that pass the level/chartType/record filters.
function planFor(category, current, bound, top10, keep) {
  const spec = SPECS[category];
  if (!spec) return { steps: [], cards: [] };
  const items = spec.steps.filter((item) => keep(CHARTS[item.chart], item.card({ chart: CHARTS[item.chart], cur: current, gain: 0 })));
  const reach = spec.reach && items.length === spec.steps.length;
  const gap = bound - current;
  const total = reach ? gap : gap * 0.4;
  const weight = items.length * (items.length + 1) / 2;
  let sum = 0;
  const picked = [];
  const steps = items.map((item, index) => {
    const chart = CHARTS[item.chart];
    const gain = index === items.length - 1 && reach ? round2(total - sum) : round2(total * (items.length - index) / weight);
    sum = round2(sum + gain);
    const after = reach && index === items.length - 1 ? bound : round2(current + sum);
    picked.push(entryOf(chart, (top10[9 - index]?.value ?? top10.at(-1)?.value ?? 0) + gain + 0.5));
    const kept = top10.slice(0, 10 - picked.length);
    const out = top10[10 - picked.length];
    const step = { chartId: chart.chartId, title: chart.title, chartType: chart.chartType, level: chart.level,
      noteCount: chart.noteCount, targetExScore: item.ex, after, remainingGap: round2(Math.max(0, bound - after)),
      top10: [...kept, ...picked], replaced: out ? [out] : [] };
    const info = { chart, cur: current, gain };
    return { step, card: card(chart, { category }, { targetExScore: item.ex, gain, after: round2(current + gain),
      radarValue: round2(current + 38 + gain), remainingGap: round2(Math.max(0, gap - gain)), ...item.card(info) }) };
  });
  return { steps: steps.map((item) => item.step), cards: steps.map((item) => item.card) };
}

// target: { requestedTitle, target }. requestedTitle is null for a numeric goal, even one equal to a bound.
export function titleRecommendationData(category, scenario, filters, summary, target) {
  const bound = target.target;
  const item = summary.categories.find((entry) => entry.category === category);
  if (!summary.importedAt || !item) return missingOfficial(category, summary, target);
  const current = item.current;
  if (current >= bound) {
    return envelope(category, summary, { goal: goalProgress({ ...target, current, status: 'ALREADY_ACHIEVED' }),
      plan: { steps: [], targets: [], after: current, estimatedTitle: titleOf(current), remainingGap: 0,
        status: 'ALREADY_ACHIEVED', estimated: true } });
  }
  const reason = blockingIssue(item);
  const catalogMissing = summary.catalog?.available === false;
  const blocked = !!reason || catalogMissing;
  const issues = [reason, catalogMissing ? issue('CATALOG_UNAVAILABLE') : null].filter(Boolean);
  const normalLike = !['empty', 'exploration'].includes(scenario);
  // In title mode the record filter means "has any personal record", including a historical best.
  const hasRecord = (row) => row.currentExScore != null || row.historicalBestExScore != null;
  const match = (row) => (!filters.level || row.level === Number(filters.level))
    && (!filters.chartType || row.chartType === filters.chartType)
    && (filters.record !== 'present' || hasRecord(row))
    && (filters.record !== 'absent' || !hasRecord(row));
  const keep = (chart, fields) => match({ level: chart.level, chartType: chart.chartType,
    currentExScore: fields.currentExScore ?? null, historicalBestExScore: fields.historicalBestExScore ?? null });
  const { steps, cards } = blocked || !normalLike ? { steps: [], cards: [] } : planFor(category, current, bound, item.top10, keep);
  const extra = blocked || !normalLike ? { recommendations: [], exploration: [] } : extraCards(category, current);
  const refresh = category === 'PEAK' && !blocked && normalLike;
  let exploration = extra.exploration;
  if (scenario === 'exploration') exploration = [card(CHARTS[4], { category }, { status: 'EXPLORATION',
    reasons: ['모의 상태: 추정 자료가 부족합니다. 직접 목표를 입력해 주세요.'] })];
  const recommendations = refresh || blocked ? [] : [...cards, ...extra.recommendations].filter(match);
  const refreshRequired = refresh ? refreshCards(category, current).filter(match) : [];
  const after = steps.length ? steps.at(-1).after : current;
  const remaining = round2(Math.max(0, bound - after));
  const status = blocked ? 'BLOCKED' : remaining === 0 ? 'ESTIMATED_REACHED' : steps.length ? 'PARTIAL' : 'NO_CANDIDATES';
  const goalStatus = blocked ? 'BLOCKED' : refreshRequired.length && !recommendations.length ? 'REFRESH_REQUIRED' : 'NEEDS_PLAY';
  return envelope(category, summary, { recommendations, exploration: blocked ? [] : exploration.filter(match),
    issues, goal: goalProgress({ ...target, current, status: goalStatus }),
    refreshRequired, plan: { steps, targets: steps.map((step) => ({ chartId: step.chartId, exScore: step.targetExScore })),
      after, estimatedTitle: titleOf(after), remainingGap: remaining, status, estimated: true } });
}
