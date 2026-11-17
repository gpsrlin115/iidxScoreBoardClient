// Title-mode (goalTitle) recommendation responses for the synthetic note radar mock.
import { CHARTS } from './note-radar-mock-data.mjs';
import { BOUNDS, envelope, goalProgress, missingOfficial, parseGoalTitle, round2, titleOf } from './note-radar-mock-ladder.mjs';
import { SPECS, card, extraCards, refreshCards } from './note-radar-mock-title-cards.mjs';

export { parseGoalTitle, titleOf };
export const BLOCKED_ISSUE = '공식 기여곡 10곡이 확인되지 않아 칭호 도달 계산을 보류했습니다.';
export const UNIDENTIFIED_ISSUE = '집계곡을 식별하지 못해 추천 계산을 보류했습니다.';
export const REPEATED_SONG_ISSUE = '같은 곡의 여러 난이도가 포함되어 공식 집계 규칙 확인 전 계산을 보류했습니다.';
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
    picked.push(entryOf(chart, top10[9 - index].value + gain + 0.5));
    const kept = top10.slice(0, 10 - picked.length);
    const step = { chartId: chart.chartId, title: chart.title, chartType: chart.chartType, level: chart.level,
      noteCount: chart.noteCount, targetExScore: item.ex, after, remainingGap: round2(Math.max(0, bound - after)),
      top10: [...kept, ...picked], replaced: [top10[10 - picked.length]] };
    const info = { chart, cur: current, gain };
    return { step, card: card(chart, { category }, { targetExScore: item.ex, gain, after: round2(current + gain),
      radarValue: round2(current + 38 + gain), remainingGap: round2(Math.max(0, gap - gain)), ...item.card(info) }) };
  });
  return { steps: steps.map((item) => item.step), cards: steps.map((item) => item.card) };
}

export function titleRecommendationData(category, scenario, filters, summary) {
  const goalTitle = parseGoalTitle(filters.goalTitle);
  const bound = BOUNDS[goalTitle];
  const item = summary.categories.find((entry) => entry.category === category);
  const target = { requestedTitle: goalTitle, target: bound };
  if (!summary.importedAt || !item) return missingOfficial(category, summary, target);
  const current = item.current;
  if (current >= bound) {
    return envelope(category, summary, { goal: goalProgress({ ...target, current, status: 'ALREADY_ACHIEVED' }),
      plan: { steps: [], targets: [], after: current, estimatedTitle: titleOf(current), remainingGap: 0,
        status: 'ALREADY_ACHIEVED', estimated: true } });
  }
  // Server order of blocked reasons: repeated song, fewer than 10 entries, unidentified entry.
  const songIds = item.top10.map((entry) => entry.songId).filter((id) => id !== null && id !== undefined);
  const repeated = new Set(songIds).size !== songIds.length;
  const unresolved = item.complete === false || item.top10.some((entry) => entry.chartId == null || entry.songId == null);
  const blocked = repeated || item.top10.length !== 10 || unresolved;
  const issue = repeated ? REPEATED_SONG_ISSUE : item.top10.length < 10 ? BLOCKED_ISSUE : UNIDENTIFIED_ISSUE;
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
    issues: blocked ? [issue] : [], goal: goalProgress({ ...target, current, status: goalStatus }),
    refreshRequired, plan: { steps, targets: steps.map((step) => ({ chartId: step.chartId, exScore: step.targetExScore })),
      after, estimatedTitle: titleOf(after), remainingGap: remaining, status, estimated: true } });
}
