import { extractChartText } from './ocrText.js';
import { sampleAcross } from './videoSampling.js';

export const ocrCrop = (width, height) => ({
  x: Math.round(width * 0.16),
  y: 0,
  width: Math.round(width * 0.62),
  height: Math.max(80, Math.round(height * 0.2)),
});

export const ocrRegion = (width, height, contentRect) => {
  if (!contentRect) return ocrCrop(width, height);
  const { x, y, width: contentWidth, height: contentHeight } = contentRect;
  if (![x, y, contentWidth, contentHeight].every(Number.isFinite)
    || x < 0 || y < 0 || contentWidth <= 0 || contentHeight <= 0
    || x + contentWidth > width || y + contentHeight > height) {
    throw new Error('선택한 영상 영역이 공유 화면을 벗어났습니다. 영상 영역을 다시 지정하세요.');
  }
  const crop = ocrCrop(contentWidth, contentHeight);
  return {
    x: x + crop.x,
    y: y + crop.y,
    width: Math.min(crop.width, contentWidth - crop.x),
    height: Math.min(crop.height, contentHeight),
  };
};

const informationScore = (context, width, height) => {
  const data = context.getImageData(0, 0, width, height).data;
  let sum = 0;
  let square = 0;
  let visible = 0;
  for (let offset = 0; offset < data.length; offset += 16) {
    const luminance = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
    sum += luminance;
    square += luminance * luminance;
    if (luminance > 18) visible += 1;
  }
  const count = data.length / 16;
  const mean = sum / Math.max(1, count);
  const contrast = Math.sqrt(Math.max(0, square / Math.max(1, count) - mean ** 2));
  return contrast + (visible / Math.max(1, count)) * 30 - (mean < 8 ? 80 : 0);
};

export const recognizeChartText = async (video, onProgress = () => {}, contentRect = null) => {
  if (!video.videoWidth || !video.videoHeight) throw new Error('영상 프레임을 아직 읽을 수 없습니다.');
  if (!video.srcObject && (video.videoWidth < 1280 || video.videoHeight < 720)) {
    throw new Error('OCR에는 최소 720p 영상 프레임이 필요합니다.');
  }
  const region = ocrRegion(video.videoWidth, video.videoHeight, contentRect);
  const frames = [];
  // Stepped through the recording rather than read off whatever frame is on
  // screen. The banner is not on the first frame — a recording opens on a
  // splash screen — and finding it was left to the viewer scrubbing for it.
  await sampleAcross(video, 5, (index, frame) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(1200, region.width * (video.srcObject ? 2 : 1));
    canvas.height = Math.round(region.height * (canvas.width / region.width));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(frame, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
    frames.push({ canvas, score: informationScore(context, canvas.width, canvas.height) });
    onProgress(frames.length / 10);
  });
  frames.sort((left, right) => right.score - left.score);
  let worker;
  try {
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker(['eng', 'jpn'], undefined, {
      langPath: import.meta.env.VITE_TESSERACT_LANG_PATH || undefined,
      logger: (message) => message.progress && onProgress(0.5 + message.progress * 0.5),
    });
  } catch (error) {
    throw new Error(`OCR 언어 자료를 불러오지 못했습니다. ${error instanceof Error ? error.message : String(error)}`);
  }
  const texts = [];
  const lines = [];
  const sharedFrames = [];
  try {
    for (const frame of frames.slice(0, 3)) {
      // Line structure and per-word confidence are what separate the title from
      // the rest of the banner, so the recogniser is asked for both. Collapsing
      // it all into one string is what sent a whole screen of text as a title.
      const result = await worker.recognize(frame.canvas, {}, { blocks: true, text: true });
      const text = (result.data.text || '').trim();
      if (text && !texts.includes(text)) texts.push(text);
      const frameLines = [];
      for (const block of result.data.blocks || []) {
        for (const paragraph of block.paragraphs || []) frameLines.push(...(paragraph.lines || []));
      }
      lines.push(...frameLines);
      if (video.srcObject) sharedFrames.push({
        lines: frameLines, text, width: frame.canvas.width, height: frame.canvas.height,
      });
    }
  } catch (error) {
    throw new Error(`공유 영상의 문자를 인식하지 못했습니다. ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await worker.terminate();
  }
  return extractChartText(lines, texts, video.srcObject ? { sharedFrames } : undefined);
};
