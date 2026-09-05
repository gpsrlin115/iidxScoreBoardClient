/**
 * A candidate is identified by its textage song key.
 *
 * `chartId` cannot serve as the identity. It is null for songs the ScoreBoard
 * catalogue does not carry, so comparing it marks every such candidate selected
 * at once (null === null), collides as a React key, and makes a falsy check
 * treat a legitimate selection as no selection at all.
 */
export const candidateKey = (candidate) => {
  if (candidate?.songKey) return `song:${candidate.songKey}`;
  if (candidate?.chartId != null) return `chart:${candidate.chartId}`;
  return null;
};

export const describeMatch = (match) => {
  if (match?.status === 'MATCHED') return '배치 분석이 완료됐습니다.';
  if (match?.reason === 'DIFFICULTY_MISMATCH') {
    return '같은 곡의 다른 난이도가 더 잘 맞습니다. 제안된 채보로 다시 대조하세요.';
  }
  return `분석 결과: ${match?.status}`;
};
