// Synthetic card fixtures for title-mode recommendations. Together they cover every contract enum.
import { CHARTS, IMPORTED_AT } from './note-radar-mock-data.mjs';
import { round2 } from './note-radar-mock-ladder.mjs';

const LATER = '2026-10-19T09:30:00Z';
export const rateOf = (exScore, noteCount) => Math.floor(exScore / (noteCount * 2) * 10000) / 100;

export const option = (chart, current, exScore, basis, support, gain) => ({ basis, exScore,
  targetRate: rateOf(exScore, chart.noteCount), radarValue: round2(current + 38 + gain), gain: round2(gain),
  after: round2(current + gain), support });

// Builds one card with all 37 contract fields. `o` may override any of them.
export function card(chart, ctx, o = {}) {
  const base = { chartId: chart.chartId, songId: chart.songId, title: chart.title, chartType: chart.chartType,
    level: chart.level, noteCount: chart.noteCount, currentExScore: null, currentScoreAt: null, targetExScore: null,
    targetRate: null, minExScore: Math.floor(chart.noteCount * 1.2), radarValue: null, gain: null, after: null,
    displacedTitle: `모의 집계곡 ${ctx.category} 10`, basis: null, peerCount: 0, rangeLowExScore: null,
    rangeHighExScore: null, reasons: [], goalExScore: null, sampleCount: 0, currentScoreComparable: true,
    historicalBestExScore: null, historicalRecordUpdatedAt: null, historicalPlayedAt: null,
    historicalComparability: 'NO_RECORD', releaseExScore: null, releaseScoreObservedAt: null,
    alreadyContributing: false, existingContribution: null, remainingGap: null, additionalExScore: null,
    status: 'PLAY_TARGET', targets: [], singleChartGoalStatus: 'NOT_EVALUATED', releaseObservationStatus: 'NO_OBSERVATION' };
  const merged = { ...base, ...o };
  merged.currentScoreAt = o.currentScoreAt !== undefined ? o.currentScoreAt : merged.currentExScore === null ? null : IMPORTED_AT;
  if (o.targetRate === undefined && merged.targetExScore !== null) merged.targetRate = rateOf(merged.targetExScore, chart.noteCount);
  // Title mode: currentExScore is a comparable current-release observation, so it implies releaseExScore.
  if (o.releaseExScore === undefined && merged.currentExScore !== null) merged.releaseExScore = merged.currentExScore;
  if (o.releaseScoreObservedAt === undefined && merged.releaseExScore !== null) merged.releaseScoreObservedAt = IMPORTED_AT;
  if (o.releaseObservationStatus === undefined && merged.releaseExScore !== null) merged.releaseObservationStatus = 'OBSERVED_BY_OFFICIAL_IMPORT';
  // Server: additional EX is measured against a valid historical best, otherwise null.
  if (o.additionalExScore === undefined) {
    merged.additionalExScore = merged.targetExScore !== null && merged.historicalBestExScore !== null
      && merged.historicalComparability !== 'SCORE_EXCEEDS_CURRENT_MAX'
      ? Math.max(0, merged.targetExScore - merged.historicalBestExScore) : null;
  }
  return merged;
}

// Per-category plan specs: each spec yields one plan step and one recommendation card.
export const SPECS = {
  NOTES: { reach: true, steps: [
    { chart: 0, ex: 3250, card: ({ chart, cur, gain }) => ({ currentExScore: 3100, basis: 'PERSONAL_LEVEL', sampleCount: 18,
      rangeLowExScore: 3130, rangeHighExScore: 3300, goalExScore: 3300, singleChartGoalStatus: 'REACHABLE',
      reasons: ['개인 기록을 참고한 모의 추천'], targets: [option(chart, cur, 3250, 'PERSONAL_LEVEL', 'PREDICTED_TARGET', gain),
        option(chart, cur, 3300, 'PERSONAL_LEVEL', 'PREDICTED_RANGE', gain + 0.4)] }) },
    { chart: 1, ex: 2350, card: ({ chart, cur, gain }) => ({ currentExScore: null, basis: 'REPLAY_HISTORICAL_BEST',
      historicalBestExScore: 2300, historicalRecordUpdatedAt: IMPORTED_AT, historicalComparability: 'UNVERIFIED',
      currentScoreComparable: false, sampleCount: 12, reasons: ['과거 리플레이 최고 기록 기준 모의 추천'],
      targets: [option(chart, cur, 2350, 'REPLAY_HISTORICAL_BEST', 'HISTORICAL_BEST', gain)] }) },
    { chart: 2, ex: 2400, card: ({ chart, cur, gain }) => ({ currentExScore: 2200, basis: 'SIMILAR_PLAYERS', peerCount: 14,
      sampleCount: 14, historicalBestExScore: 2500, historicalRecordUpdatedAt: IMPORTED_AT,
      historicalComparability: 'UNVERIFIED', additionalExScore: 0, reasons: ['참고 사용자 기록을 참고한 모의 추천'],
      targets: [option(chart, cur, 2400, 'SIMILAR_PLAYERS', 'PREDICTED_TARGET', gain)] }) },
  ] },
  CHORD: { reach: false, steps: [
    { chart: 1, ex: 2350, card: ({ chart, cur, gain }) => ({ currentExScore: 2300, basis: 'TITLE_REQUIRED_SCORE',
      goalExScore: 2400, singleChartGoalStatus: 'REACHABLE', reasons: ['칭호 도달에 필요한 점수 기준 모의 추천'],
      targets: [option(chart, cur, 2350, 'TITLE_REQUIRED_SCORE', 'PREDICTED_TARGET', gain)] }) },
    { chart: 3, ex: 3500, card: ({ chart, cur, gain }) => ({ currentExScore: null, basis: 'SIMILAR_PLAYERS', peerCount: 9,
      sampleCount: 9, goalExScore: null, singleChartGoalStatus: 'SINGLE_CHART_UNREACHABLE',
      reasons: ['이 곡 하나만으로는 목표에 닿지 않는 모의 추천'],
      targets: [option(chart, cur, 3500, 'SIMILAR_PLAYERS', 'PREDICTED_RANGE', gain),
        option(chart, cur, 3900, 'TITLE_REQUIRED_SCORE', 'NO_EVIDENCE', gain + 0.8)] }) },
  ] },
  SCRATCH: { reach: false, steps: [
    { chart: 0, ex: 3300, card: ({ chart, cur, gain }) => ({ currentExScore: 3100, basis: 'PERSONAL_LEVEL', sampleCount: 18,
      status: 'HISTORICAL_SCORE_MISMATCH', historicalBestExScore: 3700, historicalRecordUpdatedAt: IMPORTED_AT,
      historicalComparability: 'SCORE_EXCEEDS_CURRENT_MAX', currentScoreComparable: false, releaseExScore: 3700,
      releaseScoreObservedAt: LATER, releaseObservationStatus: 'SCORE_EXCEEDS_CURRENT_MAX',
      reasons: ['과거 기록이 현재 최대 점수를 넘어 비교할 수 없는 모의 상태'],
      targets: [option(chart, cur, 3300, 'PERSONAL_LEVEL', 'PREDICTED_TARGET', gain)] }) },
    { chart: 2, ex: 2700, card: ({ chart, cur, gain }) => ({ currentExScore: 0, basis: 'SIMILAR_PLAYERS', peerCount: 13,
      sampleCount: 13, reasons: ['참고 사용자 기록을 참고한 모의 추천'],
      targets: [option(chart, cur, 2700, 'SIMILAR_PLAYERS', 'PREDICTED_RANGE', gain)] }) },
  ] },
  SOFLAN: { reach: false, steps: [
    { chart: 1, ex: 2400, card: ({ chart, cur, gain }) => ({ currentExScore: 2300, basis: 'TITLE_REQUIRED_SCORE',
      releaseExScore: 2300, releaseScoreObservedAt: IMPORTED_AT, releaseObservationStatus: 'OBSERVED_BY_OFFICIAL_IMPORT',
      reasons: ['칭호 도달에 필요한 점수 기준 모의 추천'],
      targets: [option(chart, cur, 2400, 'TITLE_REQUIRED_SCORE', 'PREDICTED_TARGET', gain)] }) },
  ] },
};

// Cards that are not plan steps.
export const extraCards = (category, current) => {
  const ctx = { category };
  if (category === 'SOFLAN') return { recommendations: [card(CHARTS[4], ctx, { currentExScore: 1500, alreadyContributing: true,
    existingContribution: round2(current / 10), basis: 'PERSONAL_LEVEL', sampleCount: 18, targetExScore: 1560, gain: 0,
    after: current, radarValue: round2(current / 10), reasons: ['이미 기여 중인 곡의 모의 추천'],
    releaseExScore: 1500, releaseScoreObservedAt: IMPORTED_AT, releaseObservationStatus: 'OBSERVED_BY_OFFICIAL_IMPORT',
    targets: [option(CHARTS[4], current, 1560, 'PERSONAL_LEVEL', 'PREDICTED_TARGET', 0)] })],
  exploration: [card(CHARTS[3], ctx, { status: 'EXPLORATION', reasons: ['모의 상태: 추정 자료가 부족합니다.'],
    targets: [option(CHARTS[3], current, 3300, 'SIMILAR_PLAYERS', 'NO_EVIDENCE', 0)].map((t) => ({ ...t, gain: null, after: null, radarValue: null })) })] };
  if (category === 'CHARGE') return { recommendations: [], exploration: [
    card(CHARTS[4], ctx, { status: 'EXPLORATION_CHALLENGE', targetExScore: 1700, gain: 1.8, after: round2(current + 1.8),
      radarValue: round2(current + 40), basis: 'TITLE_REQUIRED_SCORE', reasons: ['추가 도전 목표로 제안하는 모의 상태'],
      targets: [option(CHARTS[4], current, 1700, 'TITLE_REQUIRED_SCORE', 'ADDITIONAL_CHALLENGE', 1.8)] }),
    card(CHARTS[3], ctx, { status: 'EXPLORATION', reasons: ['모의 상태: 추정 자료가 부족합니다.'] })] };
  return { recommendations: [], exploration: [] };
};

// PEAK: the official import is older than a release observation, so a refresh is required.
export const refreshCards = (category, current) => [0, 2].map((index) => {
  const chart = CHARTS[index];
  const ex = [3350, 2800][index === 0 ? 0 : 1];
  return card(chart, { category }, { status: 'OFFICIAL_REFRESH_REQUIRED', currentExScore: index === 0 ? 3100 : 2680,
    targetExScore: ex, basis: 'PLAN_REQUIRED_SCORE', gain: 2.4, after: round2(current + 2.4), radarValue: round2(current + 40),
    releaseExScore: ex, releaseScoreObservedAt: LATER, releaseObservationStatus: 'OBSERVED_AFTER_OFFICIAL_IMPORT',
    reasons: ['최근 관측 점수가 공식 가져오기보다 새로워 공식 기록 갱신이 필요한 모의 상태'],
    targets: [option(chart, current, ex, 'PLAN_REQUIRED_SCORE', 'CURRENT_RELEASE_OBSERVATION', 2.4)] });
});
