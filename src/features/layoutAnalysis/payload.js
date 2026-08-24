const assertObservedNotes = (observedNotes) => {
  if (observedNotes?.schemaVersion !== 'observed-notes-v1') {
    throw new Error('지원하지 않는 노트 이벤트 형식입니다.');
  }
  if (!Array.isArray(observedNotes.events) || observedNotes.events.length > 20_000) {
    throw new Error('노트 이벤트는 20,000개 이하여야 합니다.');
  }
  if (observedNotes.durationMs <= 0 || observedNotes.durationMs > 45_000) {
    throw new Error('분석 구간은 45초 이하여야 합니다.');
  }
};

const cleanGeometry = (geometry) => ({
  x: geometry.x,
  y: geometry.y,
  width: geometry.width,
  height: geometry.height,
  judgementY: geometry.judgementY,
  analysisY: geometry.analysisY,
  visibleTopY: geometry.visibleTopY,
  visibleBottomY: geometry.visibleBottomY,
  laneCenters: geometry.laneCenters || [],
  laneWidths: geometry.laneWidths || [],
  source: geometry.source || 'browser',
  confidence: geometry.confidence ?? 1,
});

export const buildLayoutMatchPayload = ({ inputSource, videoId = null, chartId, observedNotes }) => {
  assertObservedNotes(observedNotes);
  return {
    inputSource,
    videoId,
    chartId,
    observedNotes: {
      schemaVersion: observedNotes.schemaVersion,
      fps: observedNotes.fps,
      durationMs: observedNotes.durationMs,
      geometry: cleanGeometry(observedNotes.geometry),
      stableSegments: (observedNotes.stableSegments || []).map(({ startMs, endMs }) => ({ startMs, endMs })),
      normalizationProfile: observedNotes.normalizationProfile || 'BROWSER_H264',
      laneEventCounts: [...observedNotes.laneEventCounts],
      events: observedNotes.events.map(({ timeMs, lane, kind = 'tap', quality = 1 }) => ({ timeMs, lane, kind, quality })),
    },
  };
};
