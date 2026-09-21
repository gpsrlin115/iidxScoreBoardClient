// The thresholds the matcher actually judges by, copied from the sidecar so the
// screen can say which one was missed. iidaran/matching.py:142-146 computes
// coverage and lane coverage over key lanes 1..7 — the turntable is not counted —
// and iidaran/matching.py:282 decides the play side by the gap between the two
// orientations. A capture that fails either coverage test comes back AMBIGUOUS
// with its layout candidates stripped, which is why the result looks empty.
const MIN_COVERAGE = 0.4;
const MIN_LANE_COVERAGE = 7;
const MIN_SIDE_GAP = 0.02;

const ratio = (value) => (Number.isFinite(value) ? value.toFixed(3) : '—');

/**
 * What the matcher measured, as rows the screen can list.
 *
 * These numbers arrive with every answer and were being thrown away, so a
 * capture that failed said only "extraction is incomplete" — true, but it does
 * not say whether one lane went unread or the whole band did.
 */
export const describeExtraction = (diagnostics) => {
  if (!diagnostics) return null;
  const rows = [];

  const observed = diagnostics.observedKeyEvents;
  const reference = diagnostics.referenceKeyEventsInWindow;
  if (Number.isFinite(observed) && Number.isFinite(reference)) {
    rows.push({ label: '읽은 노트 / 구간 안 채보 노트', value: `${observed} / ${reference}`, ok: null });
  }

  const coverage = diagnostics.observationCoverage;
  if (Number.isFinite(coverage)) {
    rows.push({
      label: '노트를 읽어낸 비율',
      value: ratio(coverage),
      requirement: `${MIN_COVERAGE} 이상 필요`,
      ok: coverage >= MIN_COVERAGE,
    });
  }

  const lanes = diagnostics.observedLaneCoverage;
  if (Number.isFinite(lanes)) {
    rows.push({
      label: '노트를 2개 이상 읽은 건반 레인',
      value: `${lanes}개`,
      requirement: `${MIN_LANE_COVERAGE}개 모두 필요`,
      ok: lanes >= MIN_LANE_COVERAGE,
    });
  }

  const gap = diagnostics.sideDecisionGap;
  if (Number.isFinite(gap)) {
    rows.push({
      label: '1P/2P 점수 격차',
      value: `${ratio(gap)} (1P ${ratio(diagnostics.sideAssignmentP1)} · 2P ${ratio(diagnostics.sideAssignmentP2)})`,
      requirement: `${MIN_SIDE_GAP} 이상이어야 사이드 판정`,
      ok: gap >= MIN_SIDE_GAP,
    });
  }

  const correlation = diagnostics.alignmentCorrelation;
  if (Number.isFinite(correlation)) {
    rows.push({ label: '채보와의 시간 정렬 상관도', value: ratio(correlation), ok: null });
  }

  return rows.length ? rows : null;
};

// Below this the frames arrive further apart than the notes crossing the band.
const MIN_FRAME_RATE = 24;

/**
 * What the capture itself managed, which the answer does not carry.
 *
 * A capture that ran out early or arrived at a tenth of the video's rate
 * explains a poor match on its own, and neither shows up in the matcher's
 * numbers — it only sees the events it was handed.
 */
export const describeCapture = (observedNotes) => {
  if (!observedNotes) return null;
  const rows = [];
  const seconds = (observedNotes.durationMs || 0) / 1000;
  const requested = (observedNotes.requestedDurationMs || 0) / 1000;
  if (seconds > 0) {
    rows.push({
      label: '캡처된 길이',
      value: `${seconds.toFixed(1)}초`,
      requirement: requested > 0 ? `${Math.round(requested)}초 요청` : undefined,
      ok: requested > 0 ? seconds >= requested * 0.5 : null,
    });
  }
  if (Number.isFinite(observedNotes.fps)) {
    rows.push({
      label: '도착한 프레임',
      value: `${observedNotes.frameCount ?? '—'}장 · 초당 ${observedNotes.fps.toFixed(1)}장`,
      requirement: `초당 ${MIN_FRAME_RATE}장 이상 필요`,
      ok: observedNotes.fps >= MIN_FRAME_RATE,
    });
  }
  const capture = observedNotes.capture;
  if (capture?.frames) {
    // Media time against wall time says whether the video itself slowed down;
    // the worker's own time per frame says whether it was the one holding it up.
    const mediaSeconds = ((capture.lastMs ?? 0) - (capture.firstMs ?? 0)) / 1000;
    rows.push({
      label: '영상 진행 / 실제 경과',
      value: `${mediaSeconds.toFixed(1)}초 / ${(capture.wallMs / 1000).toFixed(1)}초`,
      requirement: '비슷해야 정상 재생',
      ok: capture.wallMs <= 0 || mediaSeconds * 1000 >= capture.wallMs * 0.8,
    });
    rows.push({
      label: '워커 처리 시간 (프레임당)',
      value: `평균 ${capture.workMsPerFrame.toFixed(1)}ms · 최대 ${capture.workMsMax.toFixed(1)}ms`,
      requirement: '60fps 는 16.7ms 안',
      ok: capture.workMsPerFrame <= 16.7,
    });
    if (Number.isFinite(capture.presentedFrames) && capture.presentedFrames > 0) {
      // The video counts every frame it presents; the callback only fires when
      // the main thread gets to it. The difference is frames skipped there.
      const received = capture.callbacks ?? capture.frames;
      rows.push({
        label: '영상이 표시한 프레임 / 받은 프레임',
        value: `${capture.presentedFrames}장 / ${received}장`,
        requirement: '비슷해야 건너뛴 프레임 없음',
        ok: received >= capture.presentedFrames * 0.9,
      });
    }
    if (capture.backwardSteps > 0) {
      rows.push({ label: '시각이 거꾸로 간 프레임', value: `${capture.backwardSteps}번`, ok: false });
    }
  }
  return rows.length ? rows : null;
};

/**
 * The one line that says what to do about it.
 *
 * Which test failed points at a different cause: a lane nobody read means the
 * lane coordinates are off, while every lane reading thinly means the band or
 * its threshold is.
 */
export const extractionAdvice = (diagnostics) => {
  if (!diagnostics?.incompleteExtraction) return null;
  if (Number.isFinite(diagnostics.observedLaneCoverage) && diagnostics.observedLaneCoverage < MIN_LANE_COVERAGE) {
    return '읽지 못한 건반 레인이 있습니다. 분석 영역의 X·폭이 실제 플레이필드와 맞는지 보세요.';
  }
  if (Number.isFinite(diagnostics.observationCoverage) && diagnostics.observationCoverage < MIN_COVERAGE) {
    return '모든 레인에서 노트를 적게 읽었습니다. 판정선과 가시 구간이 맞는지 보세요.';
  }
  return null;
};

/** The capture and the answer, as one file to hand over when reporting this. */
export const buildDiagnosticsFile = ({ result, observedNotes, videoId = null }) => ({
  name: `layout-analysis-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.json`,
  json: JSON.stringify({
    savedAt: new Date().toISOString(),
    videoId,
    // No frames and no video — the same time-and-lane events that were sent.
    observedNotes,
    result,
  }, null, 2),
});
