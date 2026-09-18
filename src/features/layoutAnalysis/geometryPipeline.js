import { toGray } from './imageOps.js';
import { detectJudgementRow, redRowOccupancy } from './judgementLine.js';
import { detectLaneColumns } from './laneColumns.js';
import { detectVerticalExtent } from './roiVertical.js';
import { detectVisibleBounds } from './verticalBounds.js';
import { defaultGeometry } from './detector.js';
import { isSeekable, sampleAcross } from './videoSampling.js';

// Enough samples for a percentile to mean something.
const SAMPLES = 7;
// The grid search runs downscaled; the red line does not. See sampleFrames.
const SEARCH_WIDTH = 960;

const drawTo = (video, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
};

/**
 * Two views of the same frame.
 *
 * The lane grid is found on a downscaled copy because the search is quadratic
 * in candidate columns. The judgement line is read at capture resolution: it is
 * one to three pixels tall, and area-averaging it into a smaller frame thins it
 * until no threshold separates it from the red judgement text.
 */
const sampleFrames = async (video, onProgress) => {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const scale = Math.min(1, SEARCH_WIDTH / width);
  const searchWidth = Math.round(width * scale);
  const searchHeight = Math.round(height * scale);
  const full = [];
  const grays = [];
  await sampleAcross(video, SAMPLES, (index) => {
    // Two views of the same frame. The lane grid is found on a downscaled copy
    // because the search is quadratic in candidate columns. The judgement line
    // is read at capture resolution: it is one to three pixels tall, and
    // area-averaging it into a smaller frame thins it until no threshold
    // separates it from the red judgement text.
    full.push(drawTo(video, width, height));
    grays.push(toGray(drawTo(video, searchWidth, searchHeight)));
    onProgress((index + 1) / SAMPLES);
  });
  return { full, grays, scale, searchWidth, searchHeight };
};

const cropStack = (grays, width, roi) => grays.map((gray) => {
  const crop = new Uint8ClampedArray(roi.width * roi.height);
  for (let row = 0; row < roi.height; row += 1) {
    const from = (roi.y + row) * width + roi.x;
    crop.set(gray.subarray(from, from + roi.width), row * roi.width);
  }
  return crop;
});

const clampLane = (value) => Math.min(0.999999, Math.max(0.000001, value));

/**
 * Measures the playfield from several frames instead of assuming its vertical
 * placement.
 *
 * The judgement line is where it matters: it sits near y+96% of the field on a
 * normal capture but at 382, 388 or 404 in arena modes, and the analysis band
 * is positioned from it. A fixed fraction reads the wrong rows there.
 */
export const detectGeometryMultiFrame = async (video, { onProgress = () => {} } = {}) => {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('영상 프레임을 아직 읽을 수 없습니다.');
  if (!isSeekable(video) && video.paused) {
    // Sampling a still frame seven times measures nothing; several different
    // frames are what separate the lanes from the background.
    throw new Error('공유 중인 화면을 재생한 뒤 다시 누르세요. 멈춘 화면으로는 측정할 수 없습니다.');
  }

  const { full, grays, scale, searchWidth, searchHeight } = await sampleFrames(video, onProgress);
  const lanes = detectLaneColumns({
    grays, width: searchWidth, height: searchHeight,
    rowStart: Math.round(searchHeight * 0.35),
    rowEnd: Math.round(searchHeight * 0.97),
  });
  if (!lanes) throw new Error('플레이필드를 찾지 못했습니다. 분석 영역을 직접 입력하세요.');

  const extent = detectVerticalExtent({
    grays, width: searchWidth, height: searchHeight,
    left: lanes.left, fieldWidth: lanes.fieldWidth,
    laneBoundaries: lanes.laneBoundaries, laneCenters: lanes.laneCenters,
  });
  if (!extent.ok) throw new Error('플레이필드의 세로 범위를 찾지 못했습니다. 분석 영역을 직접 입력하세요.');

  const ratio = 1 / scale;
  const x = Math.round(lanes.left * ratio);
  const fieldWidth = Math.round(lanes.fieldWidth * ratio);
  const y = Math.round(extent.top * ratio);
  const fieldHeight = Math.round(extent.height * ratio);
  const roi = { x, y, width: Math.min(fieldWidth, width - x), height: Math.min(fieldHeight, height - y) };

  const judgementRow = detectJudgementRow(full.map((image) => redRowOccupancy(image, roi)), roi.height);
  if (judgementRow === null) throw new Error('판정선을 찾지 못했습니다. 분석 영역을 직접 입력하세요.');
  const judgementY = roi.y + judgementRow;
  if (judgementY < roi.y + roi.height * 0.18 || judgementY > roi.y + roi.height - 1) {
    throw new Error('판정선이 플레이필드 밖에 있습니다. 분석 영역을 직접 입력하세요.');
  }

  const searchRoi = {
    x: lanes.left, y: extent.top,
    width: Math.min(lanes.fieldWidth, searchWidth - lanes.left),
    height: Math.min(extent.height, searchHeight - extent.top),
  };
  const bounds = detectVisibleBounds({
    grays: cropStack(grays, searchWidth, searchRoi),
    width: searchRoi.width, height: searchRoi.height,
    judgementRow: Math.round(judgementRow * scale),
    laneBoundaries: lanes.laneBoundaries, laneCenters: lanes.laneCenters,
  });
  const visibleTopY = roi.y + Math.round(bounds.top * ratio);
  const visibleBottomY = Math.min(judgementY - 2, roi.y + Math.round(bounds.bottom * ratio));
  if (visibleBottomY - visibleTopY < Math.max(12, Math.round(roi.height * 0.04))) {
    throw new Error('노트가 보이는 구간이 너무 좁습니다. 분석 영역을 직접 입력하세요.');
  }

  return {
    ...defaultGeometry(width, height, lanes.side),
    x: roi.x, y: roi.y, width: roi.width, height: roi.height,
    judgementY, visibleTopY, visibleBottomY,
    analysisY: Math.round((visibleTopY + visibleBottomY) / 2),
    side: lanes.side,
    laneCenters: lanes.laneCenters.map(clampLane),
    laneWidths: lanes.laneWidths.map(clampLane),
    source: 'browser-auto-multi',
    confidence: Number((0.35 * extent.confidence + 0.35 * bounds.confidence + 0.3 * lanes.confidence).toFixed(4)),
  };
};
