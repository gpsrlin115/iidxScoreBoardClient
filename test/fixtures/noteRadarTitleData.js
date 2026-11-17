// Shared builders for title-mode recommendation fixtures (data only, no tests).
export const card = (overrides = {}) => ({
  chartId: 1, songId: 1, title: 'Title Song', chartType: 'ANOTHER', level: 12, noteCount: 1000,
  currentExScore: null, currentScoreAt: null, targetExScore: 1600, targetRate: 80, minExScore: 1200,
  radarValue: 140, gain: 2.5, after: 112.5, displacedTitle: 'Displaced Song', basis: 'PERSONAL_LEVEL',
  peerCount: 0, rangeLowExScore: null, rangeHighExScore: null, reasons: [], goalExScore: null, sampleCount: 5,
  currentScoreComparable: true, historicalBestExScore: null, historicalRecordUpdatedAt: null,
  historicalPlayedAt: null, historicalComparability: 'NO_RECORD', releaseExScore: null,
  releaseScoreObservedAt: null, alreadyContributing: false, existingContribution: null, remainingGap: 7.5,
  additionalExScore: 1600, status: 'PLAY_TARGET', targets: [], singleChartGoalStatus: 'NOT_EVALUATED',
  releaseObservationStatus: 'NO_OBSERVATION', ...overrides,
});

export const step = (overrides = {}) => ({
  chartId: 1, title: 'Title Song', chartType: 'ANOTHER', level: 12, noteCount: 1000, targetExScore: 1550,
  after: 112.5, remainingGap: 7.5, top10: [], replaced: [{ title: 'Replaced One' }], ...overrides,
});

export const response = (overrides = {}) => ({
  category: 'NOTES', recommendations: [], exploration: [], issues: [], refreshRequired: [],
  importedAt: '2026-10-18T09:00:00Z', estimated: true,
  goal: { requestedTitle: 'DIAMOND', targetValue: 120, currentValue: 110, currentTitle: 'EMERALD', remainingGap: 10, status: 'NEEDS_PLAY' },
  plan: { steps: [step()], targets: [], after: 112.5, estimatedTitle: 'EMERALD', remainingGap: 7.5, status: 'PARTIAL', estimated: true },
  ...overrides,
});

export const legacy = (title = 'Legacy Song') => ({
  recommendations: [{ chartId: 9, title, chartType: 'HYPER', level: 11, noteCount: 1000, currentExScore: 100,
    targetExScore: 1500, gain: 3, currentScoreComparable: true }], exploration: [], issues: [],
});

export const numericResponse = (overrides = {}) => ({
  ...legacy('Numeric Song'), importedAt: '2026-10-18T09:00:00Z', estimated: true, refreshRequired: [], plan: null,
  goal: { requestedTitle: null, targetValue: 145, currentValue: 110, currentTitle: 'EMERALD', remainingGap: 35, status: 'NEEDS_PLAY' },
  ...overrides,
});
