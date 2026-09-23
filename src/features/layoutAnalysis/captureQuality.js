/**
 * What a capture's frame times say about it, all on one clock.
 *
 * The seconds a message quotes and the rate it quotes come from the same frame
 * times here, so they cannot disagree the way "9.9 seconds, 386 frames, 12.9 a
 * second" did: that rate needs a 29.9 second span, and nothing checked the two
 * against each other.
 *
 * An average rate alone also hides how the frames arrived. Thirty a second
 * spread evenly and thirty a second made of full seconds and empty ones average
 * the same, and only the first can be read — the notes of an empty second are
 * gone. So the longest gap and every second's own count are kept as well, and
 * the time left uncovered is recorded for the diagnostics. That last one is not
 * a test: frames dropped one at a time add to it while costing the matcher less
 * than an even, slower stream that adds nothing (40 a second read better than
 * 30 despite a third of its intervals being doubled).
 */

// The thresholds below come from scripts/layout-analysis/measure_frame_loss.mjs,
// which thins and punches holes in the four labelled 60fps clips and puts every
// variant through the sidecar's matcher. The rules for picking them were written
// down before the numbers were taken. Four clips show where analysis breaks;
// they cannot prove that everything short of that is safe.
//
// Thinned evenly to 24 frames a second, only one clip in four still recovered
// its layout, so by the rule the floor went from 24 to 30. At 30 all four did,
// but the lowest score was 0.6509 against the matcher's MISMATCH line of 0.65:
// there is no margin left at this floor. At 40 the lowest was 0.7359, at 50
// 0.8031.
export const MIN_FRAMES_PER_SECOND = 30;
// A single hole of up to half a second kept every clip within 0.02 of its full
// score, wherever it fell; a second-long one in the middle cost 0.0276. Half of
// the half second that held. Thirty a second arriving as half seconds on and
// off — the average of an even 30 — recovered no layout at all, and its 0.52
// second gaps are what turns it away.
export const MAX_GAP_MS = 250;
// Less than half the window is not enough to align against the chart.
export const MIN_CAPTURED_SHARE = 0.5;

// Frames further apart than this many normal intervals are a gap, not jitter.
const GAP_FACTOR = 1.5;
// Where a one-second bin's edges fall can move one frame in or out of it.
const BIN_SLACK = 1;

export const END_REASON_LABEL = {
  'window-complete': '구간을 끝까지 읽음',
  'media-ended': '영상이 끝남',
  'share-ended': '탭 공유가 끝남',
  stalled: '프레임이 끊겨 멈춤',
  'decode-error': '디코딩 오류',
};

const CLOCK_LABEL = {
  media: '영상 시각',
  capture: '캡처 시각',
  // The old capture stamped frames with when the page got round to them.
  callback: '수신 시각',
};

export const clockLabel = (clock) => CLOCK_LABEL[clock] || CLOCK_LABEL.media;

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

const seconds = (ms) => (ms / 1000).toFixed(1);

/**
 * @param timesMs   every analysed frame's time, in the order they arrived
 * @param windowMs  the stretch the capture was asked to cover
 * @param frameMs   the normal interval when the source states it (a file does);
 *                  otherwise the median of the capture's own intervals
 * @param expectedFrames how many frames the window holds, when that is known
 */
export const summarizeCapture = ({
  timesMs, windowMs, frameMs = null, expectedFrames = null,
  endReason = null, clock = 'media', wallMs = null,
}) => {
  const frames = timesMs.length;
  const deltas = [];
  let backwardSteps = 0;
  for (let index = 1; index < frames; index += 1) {
    const delta = timesMs[index] - timesMs[index - 1];
    if (delta < 0) backwardSteps += 1;
    deltas.push(delta);
  }
  const nominal = frameMs ?? median(deltas.filter((delta) => delta > 0)) ?? 0;
  const first = frames ? timesMs[0] : 0;
  const last = frames ? timesMs[frames - 1] : 0;
  const spanMs = frames > 1 ? last - first : 0;

  // A capture that says it read the whole window answers for all of it, so a
  // silence before the window's end is a gap. One that ended early is only
  // answerable up to its last frame; being short is judged separately.
  let coveredMs = Math.min(windowMs, last + nominal);
  if (!frames) coveredMs = 0;
  else if (endReason === 'window-complete') coveredMs = windowMs;
  const intervals = [{ fromMs: 0, ms: first }];
  deltas.forEach((delta, index) => intervals.push({ fromMs: timesMs[index], ms: delta }));
  if (endReason === 'window-complete' && frames) intervals.push({ fromMs: last, ms: windowMs - last });

  let maxGap = { fromMs: 0, ms: 0 };
  let missingMs = 0;
  for (const interval of intervals) {
    if (interval.ms > maxGap.ms) maxGap = interval;
    if (nominal > 0 && interval.ms > nominal * GAP_FACTOR) missingMs += interval.ms - nominal;
  }

  const bins = Math.floor(coveredMs / 1000);
  const perSecond = new Array(Math.max(0, bins)).fill(0);
  for (const time of timesMs) {
    const bin = Math.floor(time / 1000);
    if (bin >= 0 && bin < bins) perSecond[bin] += 1;
  }
  const thinSeconds = perSecond
    .map((count, bin) => ({ fromMs: bin * 1000, frames: count }))
    .filter(({ frames: count }) => count < MIN_FRAMES_PER_SECOND - BIN_SLACK);
  const worstSecond = thinSeconds.reduce((worst, bin) => (!worst || bin.frames < worst.frames ? bin : worst), null);

  return {
    clock,
    endReason,
    windowMs,
    coveredMs,
    frames,
    firstMs: frames ? first : null,
    lastMs: frames ? last : null,
    spanMs,
    ratePerSecond: spanMs > 0 ? ((frames - 1) * 1000) / spanMs : null,
    frameMs: nominal || null,
    maxGapMs: maxGap.ms,
    maxGapFromMs: maxGap.fromMs,
    missingMs,
    missingShare: coveredMs > 0 ? missingMs / coveredMs : 0,
    thinSeconds,
    worstSecond,
    expectedFrames,
    missingFrames: Number.isFinite(expectedFrames) ? Math.max(0, expectedFrames - frames) : null,
    backwardSteps,
    wallMs,
  };
};

const shortCaptureMessage = ({ endReason, coveredMs, windowMs }) => {
  const at = seconds(coveredMs);
  const asked = Math.round(windowMs / 1000);
  switch (endReason) {
    case 'media-ended':
      return `${asked}초를 분석하려 했는데 ${at}초에서 영상이 끝났습니다. 재생바를 앞쪽으로 옮긴 뒤 다시 분석하세요.`;
    case 'share-ended':
      return `탭 공유가 ${at}초에서 끝나 ${asked}초를 채우지 못했습니다. 공유를 유지한 채 다시 분석하세요.`;
    case 'stalled':
      return `${at}초 이후 프레임이 들어오지 않아 분석을 멈췄습니다. 원본 영상이 멈췄거나 화면에서 가려졌을 수 있습니다.`;
    default:
      // Nothing recorded why it stopped, so nothing is claimed.
      return `캡처가 ${at}초에서 멈췄습니다(${asked}초 요청). 다시 분석하세요.`;
  }
};

/**
 * Which test a capture's frames fail, if any, and what the screen says about it.
 * Checked before the notes are: a capture with holes in it also reads too few
 * notes, and saying so would point at the wrong cause.
 */
export const judgeCapture = (summary) => {
  if (!summary) return null;
  const clock = clockLabel(summary.clock);
  if (summary.coveredMs < summary.windowMs * MIN_CAPTURED_SHARE) {
    return { rule: 'short', message: shortCaptureMessage(summary) };
  }
  if (summary.maxGapMs > MAX_GAP_MS) {
    return {
      rule: 'gap',
      message: `${clock} ${seconds(summary.maxGapFromMs)}초 지점에서 ${seconds(summary.maxGapMs)}초 동안 프레임이 비었습니다.`
        + ' 그 사이의 노트는 읽지 못했습니다. 아래 측정값을 확인한 뒤 다시 분석하세요.',
    };
  }
  if (summary.thinSeconds.length > 0) {
    const worst = summary.worstSecond;
    return {
      rule: 'thin',
      message: `1초 구간 ${summary.thinSeconds.length}곳에서 프레임이 초당 ${MIN_FRAMES_PER_SECOND}장보다 적었습니다`
        + `(가장 적은 곳 ${clock} ${seconds(worst.fromMs)}~${seconds(worst.fromMs + 1000)}초, ${worst.frames}장).`
        + ' 이 속도에서는 노트가 프레임 사이로 지나갑니다.',
    };
  }
  return null;
};

/** The screen's sentence for `judgeCapture`, or null when the frames are enough. */
export const captureProblem = (summary) => judgeCapture(summary)?.message ?? null;
