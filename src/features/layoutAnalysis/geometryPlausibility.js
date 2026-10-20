/**
 * Whether a measured playfield leaves enough lane to read notes from.
 *
 * The detector can fit its lane grid to a piece of the real field. On one R5
 * capture it took the scratch lane and key 1 for the whole playfield — 99px
 * wide with 42px of visible lane — and nothing after it objected: the analysis
 * ran, read the scratch notes as four keys at once, and the server could only
 * answer that the notes matched no chart.
 *
 * Neither the width nor the visible height tells such a fragment apart on its
 * own. A streamed overlay shrinks the real field to 0.164 of the frame's width,
 * only twice the fragment's share; a high LIFT leaves 0.14 of the height
 * visible, close to the fragment's 0.06. The area of lane left to read, the two
 * multiplied, separates them by a wide margin.
 */

// Visible lane area over the content area, for layouts known to be real:
//   720p captures in the sidecar's auto-ROI fixtures       0.085–0.097
//   ten 720p/1080p captures kept from the LIFT review       0.085–0.107
//   R5's first Firefox share (content size estimated)       about 0.09
//   synthetic LIFT + SUDDEN+ (layoutAnalysisLift.test.js)   0.0359
//   synthetic high LIFT at 720p and 1080p                   0.0316
// The floor is half the smallest of them. The R5 fragment measured 0.005 to
// 0.007, depending on the content size assumed for it; a streamed overlay
// shrunk to 0.73 and played with LIFT and SUDDEN+ would still read about 0.019.
// These are a handful of layouts, so the check asks the viewer to confirm
// rather than refusing outright.
export const MIN_READABLE_SHARE = 0.016;

const percent = (share) => (share * 100).toFixed(1);

/** The share of the content the visible lanes cover, or null without sizes. */
export const readableShare = (geometry, contentWidth, contentHeight) => {
  if (!geometry || !(contentWidth > 0) || !(contentHeight > 0)) return null;
  const visible = Math.max(0, geometry.visibleBottomY - geometry.visibleTopY);
  return (Math.max(0, geometry.width) * visible) / (contentWidth * contentHeight);
};

/**
 * Null for a playfield shaped like a real one; otherwise what is wrong with it.
 *
 * @param content the area the geometry was measured in: the cropped video
 *                region when there is one, the whole frame otherwise
 */
export const judgeGeometry = (geometry, content) => {
  const share = readableShare(geometry, content?.width, content?.height);
  if (share === null || share >= MIN_READABLE_SHARE) return null;
  return {
    rule: 'readable-area',
    share,
    message: `노트가 보이는 레인 면적이 영상의 ${percent(share)}%뿐입니다`
      + `(실제 플레이 화면은 LIFT·SUDDEN+를 써도 보통 ${percent(MIN_READABLE_SHARE * 2)}% 이상).`
      + ' 플레이필드의 일부만 잡았을 수 있습니다. 노트가 내려오는 장면에서 다시 실측하거나 좌표를 확인하세요.',
  };
};
