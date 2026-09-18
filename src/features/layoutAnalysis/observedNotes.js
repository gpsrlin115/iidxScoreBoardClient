const MAX_DURATION_MS = 45_000;
const MAX_EVENTS = 20_000;
const MAX_STABLE_SEGMENTS = 16;

const laneTally = (events) => {
  const counts = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const event of events) {
    if (Number.isInteger(event?.lane) && event.lane >= 0 && event.lane < 8) counts[event.lane] += 1;
  }
  return counts;
};

/**
 * Trims a capture to what the server accepts. A longer capture is rejected with
 * 400 rather than truncated, and the server recomputes `laneEventCounts` from
 * the events it receives and refuses the request when the tally disagrees, so
 * dropping an event without recounting would fail the whole match.
 */
export const clampObservedNotes = (observedNotes, maxDurationMs = MAX_DURATION_MS) => {
  if (!observedNotes) return observedNotes;
  const durationMs = Math.min(observedNotes.durationMs ?? 0, maxDurationMs);
  const events = (observedNotes.events || [])
    .filter((event) => event?.timeMs <= durationMs)
    .slice(0, MAX_EVENTS);
  const stableSegments = (observedNotes.stableSegments || [])
    .map(({ startMs, endMs }) => ({ startMs, endMs: Math.min(endMs, durationMs) }))
    .filter((segment) => segment.endMs > segment.startMs)
    .slice(0, MAX_STABLE_SEGMENTS);

  return { ...observedNotes, durationMs, events, stableSegments, laneEventCounts: laneTally(events) };
};

// A 30 second capture of a chart worth analysing carries hundreds of notes.
// Far fewer means the band was read somewhere the notes are not.
const MIN_EVENTS_PER_SECOND = 1;

/**
 * Why a capture is not worth sending, in the words the screen uses.
 *
 * The server answers such a capture with AMBIGUOUS and a note that extraction
 * was incomplete, which costs one of ten daily attempts and does not say what
 * to change. Every lane is drawn in every chart, so a lane that produced
 * nothing over the whole capture was not read: the area is in the wrong place.
 */
export const extractionProblem = (observedNotes) => {
  const counts = observedNotes?.laneEventCounts || [];
  const silent = counts.map((count, lane) => ({ count, lane })).filter(({ count }) => count === 0);
  if (silent.length) {
    return `레인 ${silent.map(({ lane }) => lane + 1).join('·')}번에서 노트를 하나도 읽지 못했습니다.`
      + ' 분석 영역이 실제 플레이필드와 어긋나 있습니다. 좌표를 다시 실측하거나 직접 보정하세요.';
  }
  const seconds = (observedNotes?.durationMs || 0) / 1000;
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (seconds > 0 && total < seconds * MIN_EVENTS_PER_SECOND) {
    return `${Math.round(seconds)}초에서 노트를 ${total}개만 읽었습니다.`
      + ' 분석 영역이나 판정선이 맞지 않을 수 있습니다. 좌표를 확인하세요.';
  }
  return null;
};
