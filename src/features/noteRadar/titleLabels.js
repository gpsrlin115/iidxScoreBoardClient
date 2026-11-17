// Korean labels for server enums in title-mode responses. Unknown values are surfaced, not hidden.
const LABELS = {
  goalStatus: {
    MISSING_OFFICIAL: '공식 기록 필요', ALREADY_ACHIEVED: '이미 달성', BLOCKED: '계산 보류',
    REFRESH_REQUIRED: '공식 갱신 확인 필요', NEEDS_PLAY: '추가 플레이 필요',
  },
  planStatus: {
    ESTIMATED_REACHED: '도달 예상(추정)', PARTIAL: '일부만 도달(추정)', NO_CANDIDATES: '계획 후보 없음',
    BLOCKED: '계산 보류', ALREADY_ACHIEVED: '이미 달성',
  },
  cardStatus: {
    PLAY_TARGET: '재플레이 후보', HISTORICAL_SCORE_MISMATCH: '과거 기록 비교 불가',
    EXPLORATION: '탐색', EXPLORATION_CHALLENGE: '탐색 도전', OFFICIAL_REFRESH_REQUIRED: '공식 갱신 확인',
  },
  releaseObservation: {
    NO_OBSERVATION: '관측 없음', OBSERVED_BY_OFFICIAL_IMPORT: '공식 가져오기로 관측',
    OBSERVED_AFTER_OFFICIAL_IMPORT: '공식 가져오기 이후 관측', SCORE_EXCEEDS_CURRENT_MAX: '현재 만점 초과(비교 불가)',
    OBSERVATION_TIME_UNKNOWN: '관측 시각 불명',
  },
  historicalComparability: {
    NO_RECORD: '기록 없음', UNVERIFIED: '현재 작품 기록과 다를 수 있음',
    SCORE_EXCEEDS_CURRENT_MAX: '현재 만점을 넘어 비교 불가',
  },
  singleChartGoal: {
    REACHABLE: '이 곡만으로 도달 가능', SINGLE_CHART_UNREACHABLE: '이 곡만으로는 도달 불가', NOT_EVALUATED: '평가하지 않음',
  },
  basis: {
    PERSONAL_LEVEL: '같은 레벨·속성의 내 기록', SIMILAR_PLAYERS: '비슷한 사용자의 기록', PEERS: '비슷한 사용자의 기록',
    REPLAY_HISTORICAL_BEST: '과거 최고 기록', TITLE_REQUIRED_SCORE: '칭호 도달에 필요한 점수',
    PLAN_REQUIRED_SCORE: '계획에 필요한 점수',
  },
  support: {
    PREDICTED_TARGET: '예측 목표', PREDICTED_RANGE: '예측 범위', HISTORICAL_BEST: '과거 최고 기록',
    NO_EVIDENCE: '근거 부족', ADDITIONAL_CHALLENGE: '추가 도전', CURRENT_RELEASE_OBSERVATION: '현 작품 관측',
  },
};

export function labelFor(kind, value) {
  if (value === null || value === undefined || value === '') return '확인 필요';
  return LABELS[kind]?.[value] ?? `확인 필요(${value})`;
}
