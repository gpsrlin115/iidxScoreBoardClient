const MAX_DURATION_MS = 45_000;
const MAX_EVENTS = 20_000;
const MAX_STABLE_SEGMENTS = 16;
// The rate the server will accept. A capture whose frame times land within a
// millisecond of each other measures a rate far above any real one.
const MIN_FPS = 0.1;
const MAX_FPS = 240;

const atLeastZero = (value) => Math.max(0, value);

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
 *
 * Both ends of every range belong here. Only the upper ones were checked, and a
 * first note event at -0.0004ms — the capture start subtracted from the frame
 * that begins it — went out untouched and cost a whole match attempt.
 */
export const clampObservedNotes = (observedNotes, maxDurationMs = MAX_DURATION_MS) => {
  if (!observedNotes) return observedNotes;
  const durationMs = Math.min(observedNotes.durationMs ?? 0, maxDurationMs);
  // An event past the end really is outside the capture and is dropped; one a
  // fraction before the start is the start, so it is moved rather than lost.
  const events = (observedNotes.events || [])
    .filter((event) => event?.timeMs <= durationMs)
    .map((event) => (event.timeMs < 0 ? { ...event, timeMs: 0 } : event))
    .slice(0, MAX_EVENTS);
  const stableSegments = (observedNotes.stableSegments || [])
    .map(({ startMs, endMs }) => ({ startMs: atLeastZero(startMs), endMs: Math.min(endMs, durationMs) }))
    .filter((segment) => segment.endMs > segment.startMs)
    .slice(0, MAX_STABLE_SEGMENTS);
  const fps = Math.min(MAX_FPS, Math.max(MIN_FPS, observedNotes.fps ?? MIN_FPS));

  return { ...observedNotes, fps, durationMs, events, stableSegments, laneEventCounts: laneTally(events) };
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
