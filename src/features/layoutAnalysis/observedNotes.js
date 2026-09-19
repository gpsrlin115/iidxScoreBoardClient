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
// What the matcher asks of a lane before it counts as read at all
// (iidaran/matching.py:145). It applies the test to the seven key lanes and
// leaves the turntable out, so one sparse lane here is the turntable and is
// allowed; a second one means lanes are being missed.
const MIN_EVENTS_PER_LANE = 2;
const ALLOWED_SPARSE_LANES = 1;
// A capture that ran out well before the window it asked for hit the end of the
// video. The matcher then aligns those few seconds against the whole chart and
// cannot place them.
const MIN_CAPTURED_SHARE = 0.5;
// A note crosses the analysis band in roughly 40ms, so below about this rate
// the frames arrive further apart than the notes they are meant to catch and
// most of them are never seen.
const MIN_FRAME_RATE = 24;

/**
 * Why a capture is not worth sending, in the words the screen uses.
 *
 * The server answers such a capture with AMBIGUOUS, a note that extraction was
 * incomplete, and its layout candidates stripped out — which costs one of ten
 * daily attempts and does not say what to change. The test matches the one the
 * matcher applies, so what passes here is what the matcher will accept.
 */
export const extractionProblem = (observedNotes) => {
  const counts = observedNotes?.laneEventCounts || [];
  const seconds = (observedNotes?.durationMs || 0) / 1000;

  const requested = (observedNotes?.requestedDurationMs || 0) / 1000;
  if (requested > 0 && seconds < requested * MIN_CAPTURED_SHARE) {
    return `${Math.round(requested)}초를 분석하려 했는데 ${seconds.toFixed(1)}초에서 영상이 끝났습니다.`
      + ' 재생바를 앞쪽으로 옮긴 뒤 다시 분석하세요.';
  }

  const fps = observedNotes?.fps;
  if (Number.isFinite(fps) && fps < MIN_FRAME_RATE && observedNotes?.frameCount) {
    return `${seconds.toFixed(1)}초 동안 프레임이 ${observedNotes.frameCount}장(초당 ${fps.toFixed(1)}장)만 도착했습니다.`
      + ' 노트가 프레임 사이로 지나가 대부분 읽히지 않습니다. 영상 창이 화면에 보이는 상태로 두고 다시 분석하세요.';
  }

  const sparse = counts
    .map((count, lane) => ({ count, lane }))
    .filter(({ count }) => count < MIN_EVENTS_PER_LANE);
  if (sparse.length > ALLOWED_SPARSE_LANES) {
    return `레인 ${sparse.map(({ lane, count }) => `${lane + 1}번(${count}개)`).join(', ')}에서 노트를 거의 읽지 못했습니다.`
      + ' 분석 영역이 실제 플레이필드와 어긋나 있습니다. 좌표를 다시 실측하거나 직접 보정하세요.';
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (seconds > 0 && total < seconds * MIN_EVENTS_PER_SECOND) {
    return `${Math.round(seconds)}초에서 노트를 ${total}개만 읽었습니다.`
      + ' 분석 영역이나 판정선이 맞지 않을 수 있습니다. 좌표를 확인하세요.';
  }
  return null;
};
