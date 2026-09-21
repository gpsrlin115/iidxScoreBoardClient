/**
 * The server answers with a status and an optional reason, and the reason is
 * the more specific of the two: a difficulty mismatch arrives as MISMATCH plus
 * DIFFICULTY_MISMATCH, and a reference it could not verify arrives as AMBIGUOUS
 * plus REFERENCE_UNVERIFIED. Reading the status first would present both as a
 * bare result code, so every reason is resolved before the status is consulted.
 */
const REASONS = {
  DIFFICULTY_MISMATCH: {
    tone: 'retryable',
    message: '같은 곡의 다른 난이도가 더 잘 맞습니다. 제안된 채보로 다시 대조하세요.',
  },
  DIFFICULTY_AMBIGUOUS: {
    tone: 'provisional',
    message: '같은 곡의 여러 난이도가 비슷하게 맞습니다. 난이도를 직접 골라 다시 대조하세요.',
  },
  DIFFICULTY_CHECK_INCOMPLETE: {
    tone: 'provisional',
    message: '다른 난이도와의 대조를 끝내지 못했습니다. 결과를 확정으로 보지 마세요.',
  },
  REFERENCE_UNVERIFIED: {
    tone: 'provisional',
    message: '채보 참조를 검증하지 못했습니다. 결과를 확정으로 보지 마세요.',
  },
  REFERENCE_NOTE_COUNT_MISMATCH: {
    tone: 'failed',
    message: '채보 참조의 노트 수가 맞지 않아 대조하지 않았습니다.',
  },
  REFERENCE_UNAVAILABLE: {
    tone: 'failed',
    message: '채보 참조를 가져오지 못했습니다.',
  },
};

const STATUSES = {
  MATCHED: { tone: 'success', message: '배치 분석이 완료됐습니다.' },
  MISMATCH: { tone: 'failed', message: '관측한 배치가 이 채보와 맞지 않습니다.' },
  AMBIGUOUS: { tone: 'provisional', message: '배치를 하나로 좁히지 못했습니다.' },
  FAILED: { tone: 'failed', message: '배치 분석에 실패했습니다.' },
  // Refused in the browser before any request went out; the message is the
  // reason the capture could not be analysed.
  NOT_SENT: { tone: 'failed', message: '캡처가 분석에 쓸 수 없어 요청을 보내지 않았습니다.' },
};

export const interpretMatch = (match) => {
  const reason = match?.reason;
  const refused = match?.status === 'NOT_SENT' && match.clientProblem
    ? { tone: 'failed', message: match.clientProblem }
    : null;
  const resolved = refused
    || (reason && REASONS[reason])
    || STATUSES[match?.status]
    || { tone: 'failed', message: `분석 결과: ${match?.status}` };

  return {
    tone: resolved.tone,
    message: resolved.message,
    // A reason always narrows the result, so MATCHED carrying one is never a
    // completed analysis. An unverified reference is not a confirmation either.
    confirmed: match?.status === 'MATCHED' && !reason && match?.reference?.verified !== false,
    verified: match?.reference?.verified !== false,
    // The server strips the suggestion when it downgrades to AMBIGUOUS, so the
    // retry path has to treat the key as optional.
    suggestedTextageChartKey: match?.suggestedTextageChartKey || null,
    side: match?.side || null,
  };
};

export const describeMatch = (match) => interpretMatch(match).message;

/**
 * After a successful re-match the highlighted candidate must follow the chart
 * the server actually compared, otherwise the list keeps pointing at the
 * difficulty that was rejected.
 */
export const selectionAfterRematch = (match) => {
  const chart = match?.chart;
  if (!chart?.textageChartKey && chart?.chartId == null) return null;
  return {
    chartId: chart.chartId ?? null,
    textageChartKey: chart.textageChartKey ?? null,
    title: chart.title,
    artist: chart.artist,
    chartType: chart.chartType,
    level: chart.level,
  };
};
