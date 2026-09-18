// Where to look in a recording. A capture of a play starts on a splash screen
// and ends on the results, so both ends are skipped: there is no playfield and
// no song banner there.
const SEARCH_FROM = 0.2;
const SEARCH_TO = 0.8;

/** True for a file the browser can jump around in, false for a live capture. */
export const isSeekable = (video) => Number.isFinite(video?.duration) && video.duration > 0
  && video.seekable?.length > 0;

export const seekTo = (video, seconds) => new Promise((resolve, reject) => {
  const timeout = window.setTimeout(() => reject(new Error('영상 위치를 옮기지 못했습니다.')), 5_000);
  const done = () => { window.clearTimeout(timeout); resolve(); };
  video.addEventListener('seeked', done, { once: true });
  video.currentTime = seconds;
});

export const nextFrame = (video, delayMs) => new Promise((resolve) => {
  if ('requestVideoFrameCallback' in video && !video.paused) video.requestVideoFrameCallback(() => resolve());
  else window.setTimeout(resolve, delayMs);
});

/**
 * The moments to sample a recording at.
 *
 * Spread across the middle rather than taken one after another, so a cover that
 * moves, a section the notes thin out in, or a frame the banner happens to be
 * hidden on cannot decide the answer alone.
 */
export const searchTimesSeconds = (duration, samples) => {
  const from = duration * SEARCH_FROM;
  const span = duration * (SEARCH_TO - SEARCH_FROM);
  return Array.from({ length: samples }, (unused, index) => from + (span * index) / Math.max(1, samples - 1));
};

/** Where a capture should start when the viewer has not chosen a position. */
export const analysisStartSeconds = (video) => (
  isSeekable(video) && video.currentTime < 1 ? video.duration * SEARCH_FROM : video.currentTime
);

/**
 * Walks a video, handing each sampled frame to `take`.
 *
 * A recording is stepped through and put back where it was; a live capture can
 * only be watched as it plays. Reading whatever frame happens to be on screen
 * is what made both the area measurement and the title reading depend on the
 * viewer scrubbing to the right moment first.
 */
export const sampleAcross = async (video, samples, take, { spacingMs = 320 } = {}) => {
  const times = isSeekable(video) ? searchTimesSeconds(video.duration, samples) : null;
  const resume = { time: video.currentTime, paused: video.paused };
  try {
    for (let index = 0; index < samples; index += 1) {
      if (times) await seekTo(video, times[index]);
      else await nextFrame(video, spacingMs);
      await take(index);
    }
  } finally {
    if (times) {
      try { await seekTo(video, resume.time); } catch { /* leaving it is harmless */ }
      if (!resume.paused) video.play().catch(() => {});
    }
  }
};
