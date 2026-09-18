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
