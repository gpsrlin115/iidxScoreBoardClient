// Every identifier and score in this module is synthetic local fixture data.
export const CATEGORIES = ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOFLAN'];
export const SCENARIOS = ['normal', 'no-import', 'unlinked', 'blocked', 'partial', 'empty', 'exploration',
  'disabled', 'mismatch', 'expired', 'pending', 'recommendations-failed', 'partial-failure',
  'slow-recommendations', 'slow-simulation', 'save-failed', 'goals-failed', 'reimport', 'highest', 'signed-out'];
export const IIDX_ID = '1234-5678';
export const IMPORTED_AT = '2026-10-18T01:00:00Z';
export const USER = { id: 900001, username: 'radar-mock', nickname: '레이더 모의 사용자',
  email: 'radar-mock@example.test', role: 'USER', avatarUrl: null };

const titles = ['모의 검증곡 · 별빛의 장거리 여행과 아주 긴 곡명을 비교하는 밤', '모의 검증곡 · CHORD DRIVE',
  '모의 검증곡 · ZERO SCORE', '모의 검증곡 · NO RECORD', '모의 검증곡 · DIRECT TARGET'];
export const CHARTS = titles.map((title, index) => ({ chartId: 910001 + index, songId: 920001 + index,
  title, chartType: ['ANOTHER', 'HYPER', 'ANOTHER', 'LEGGENDARIA', 'NORMAL'][index],
  level: [12, 10, 11, 12, 8][index], noteCount: [1800, 1300, 1500, 1950, 900][index] }));

export function fixtureGoal(index, category, status, targetExScore) {
  return { ...CHARTS[index], id: 930001 + index, category, targetExScore,
    achieved: status === 'ACHIEVED', status, updatedAt: IMPORTED_AT };
}
export const initialGoals = () => [fixtureGoal(0, 'NOTES', 'IN_PROGRESS', 3250),
  fixtureGoal(1, 'CHORD', 'ACHIEVED', 2300), fixtureGoal(3, 'SCRATCH', 'UNVERIFIED', 3450)];

const entry = (categoryIndex, rank, value) => ({ chartId: 940001 + categoryIndex * 10 + rank,
  songId: 950001 + categoryIndex * 10 + rank, title: `모의 집계곡 ${CATEGORIES[categoryIndex]} ${rank + 1}`,
  chartType: rank % 2 ? 'HYPER' : 'ANOTHER', value });
export function categoryData(category, scenario, importedAgain = false) {
  const index = CATEGORIES.indexOf(category);
  const current = scenario === 'highest' ? 185 : 110 - index * 7 + (importedAgain ? 2.5 : 0);
  const top10 = Array.from({ length: 10 }, (_, rank) => entry(index, rank, current + 9 - rank * 2));
  const changed = importedAgain || scenario === 'reimport';
  const left = { ...top10[9], title: `모의 제외곡 ${category}` };
  if (changed) top10[9] = { ...CHARTS[0], value: top10[9].value };
  const complete = !['blocked', 'partial'].includes(scenario) || index !== 0;
  if (!complete) top10[9] = { ...top10[9], chartId: null, songId: null };
  return { category, current, previous: changed ? current - 2.5 : null, delta: changed ? 2.5 : null,
    title: current >= 180 ? 'RESIDENT' : current >= 100 ? 'EMERALD' : current >= 80 ? 'GOLD' : 'SILVER',
    nextThreshold: current >= 180 ? null : current >= 100 ? 120 : current >= 80 ? 100 : 80,
    top10, complete, issues: complete ? [] : ['모의 상태: 일부 집계곡을 식별하지 못해 계산을 보류했습니다.'],
    changes: { entered: changed ? [top10[9]] : [], left: changed ? [left] : [], updated: changed ? [top10[0]] : [] } };
}

export function summaryData(state) {
  const absent = ['no-import', 'unlinked', 'pending', 'expired', 'mismatch'].includes(state.scenario) && !state.importedAgain;
  return { release: '34', playStyle: 'SP', iidxId: state.scenario === 'unlinked' ? null : IIDX_ID,
    importedAt: absent ? null : state.importedAt,
    previousImportedAt: state.importedAgain || state.scenario === 'reimport' ? IMPORTED_AT : null,
    catalog: { available: true, source: 'SYNTHETIC_MOCK_ONLY', updatedAt: IMPORTED_AT, sha256: 'mock-fixture-no-production-catalog',
      sourceRows: 65, matchedCharts: 65, estimated: true },
    categories: absent ? [] : CATEGORIES.map((category) => categoryData(category, state.scenario, state.importedAgain)),
    goals: state.goals, estimated: true };
}

export function recommendationData(category, scenario, filters = {}) {
  const current = categoryData(category, scenario).current;
  const rows = CHARTS.slice(0, 4).map((chart, index) => {
    const targetExScore = [3250, 2350, 2680, 3500][index];
    const currentExScore = [3100, 2300, 0, null][index];
    return { ...chart, currentExScore, currentScoreAt: currentExScore === null ? null : IMPORTED_AT,
      targetExScore, targetRate: Math.floor(targetExScore / (chart.noteCount * 2) * 10000) / 100,
      minExScore: [2950, 2220, 2500, 3300][index], radarValue: current + 40 - index * 5,
      gain: 4 - index * 0.65, after: current + 4 - index * 0.65, displacedTitle: `모의 집계곡 ${category} 10`,
      basis: index === 0 ? 'PERSONAL_LEVEL' : 'SIMILAR_PLAYERS', peerCount: index === 0 ? 0 : 12 + index,
      rangeLowExScore: targetExScore - 120, rangeHighExScore: targetExScore + 50,
      reasons: [index === 0 ? '개인 기록을 참고한 모의 추천' : '참고 사용자 기록을 참고한 모의 추천'],
      goalExScore: Number(filters.goal) > current + 10 ? null : targetExScore + 50,
      sampleCount: index === 0 ? 18 : 12 + index, currentScoreComparable: index !== 1 };
  });
  const exploration = [{ ...rows[3], ...CHARTS[4], currentExScore: null, currentScoreAt: null,
    targetExScore: null, targetRate: null, minExScore: 1600, radarValue: null, gain: null, after: null,
    basis: null, peerCount: 0, sampleCount: 0, rangeLowExScore: null, rangeHighExScore: null,
    goalExScore: null, reasons: ['모의 상태: 추정 자료가 부족합니다. 직접 목표를 입력해 주세요.'] }];
  const matches = (row) => (!filters.level || row.level === Number(filters.level))
    && (!filters.chartType || row.chartType === filters.chartType)
    && (filters.record !== 'present' || row.currentExScore !== null)
    && (filters.record !== 'absent' || row.currentExScore === null);
  const blocked = ['blocked', 'partial'].includes(scenario) && category === 'NOTES';
  return { category, recommendations: blocked || ['empty', 'exploration'].includes(scenario) ? [] : rows.filter(matches),
    exploration: blocked || scenario === 'empty' ? [] : exploration.filter(matches),
    issues: blocked ? ['모의 상태: 집계곡을 식별하지 못해 추천 계산을 보류했습니다.'] : [] };
}

export function officialPayload() {
  return { release: '34', playStyle: 'SP', iidxId: IIDX_ID,
    categories: CATEGORIES.map((category) => {
      const data = categoryData(category, 'normal');
      return { category, value: data.current, entries: data.top10.map(({ title, chartType, value }) =>
        ({ externalId: null, title, chartType, value })) };
    }) };
}

export function simulateData(targets, state) {
  // Deterministic fixture effects; this deliberately is not the production formula.
  const unique = new Map();
  targets.forEach((target) => unique.set(target.chartId, Math.max(unique.get(target.chartId) ?? 0, target.exScore)));
  const submitted = [...unique].map(([chartId, exScore]) => ({ chartId, exScore }));
  const strongest = Math.max(0, ...submitted.map(({ chartId, exScore }) => exScore / (CHARTS.find((chart) => chart.chartId === chartId).noteCount * 2)));
  return { categories: CATEGORIES.map((category, index) => {
    const data = categoryData(category, state.scenario, state.importedAgain);
    const gain = Number((strongest * (4 - index * 0.45)).toFixed(2));
    return { category, before: data.current, after: data.complete ? Number((data.current + gain).toFixed(2)) : null,
      gain: data.complete ? gain : null, displacedTitle: data.top10[9].title,
      top10: data.top10, blocked: !data.complete };
  }), targets: submitted, estimated: true,
  targetValues: submitted.map(({ chartId, exScore }) => ({ chartId, exScore,
    values: Object.fromEntries(CATEGORIES.map((category, index) => [category, Number((exScore / 25 - index * 2).toFixed(2))])) })) };
}
