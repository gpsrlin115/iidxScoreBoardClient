export const ocrCrop = (width, height) => ({
  x: Math.round(width * 0.16),
  y: 0,
  width: Math.round(width * 0.62),
  height: Math.max(80, Math.round(height * 0.2)),
});

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

const nextFrame = (video) => new Promise((resolve) => {
  if ('requestVideoFrameCallback' in video && !video.paused) video.requestVideoFrameCallback(resolve);
  else window.setTimeout(resolve, 120);
});

export const recognizeChartText = async (video, onProgress = () => {}) => {
  if (!video.videoWidth || video.videoWidth < 1280 || video.videoHeight < 720) {
    throw new Error('OCR에는 최소 720p 영상 프레임이 필요합니다.');
  }
  const region = ocrCrop(video.videoWidth, video.videoHeight);
  const frames = [];
  for (let index = 0; index < 5; index += 1) {
    await nextFrame(video);
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(1200, region.width);
    canvas.height = Math.round(region.height * (canvas.width / region.width));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
    frames.push({ canvas, score: informationScore(context, canvas.width, canvas.height) });
    onProgress((index + 1) / 10);
  }
  frames.sort((left, right) => right.score - left.score);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'jpn'], undefined, {
    langPath: import.meta.env.VITE_TESSERACT_LANG_PATH || undefined,
    logger: (message) => message.progress && onProgress(0.5 + message.progress * 0.5),
  });
  const titles = [];
  try {
    for (const frame of frames.slice(0, 3)) {
      const result = await worker.recognize(frame.canvas);
      const text = result.data.text.replace(/\s+/g, ' ').trim();
      if (text && !titles.includes(text)) titles.push(text.slice(0, 255));
    }
  } finally {
    await worker.terminate();
  }
  const pattern = /\b(BEGINNER|NORMAL|HYPER|ANOTHER|LEGGENDARIA)\b/gi;
  const difficulties = [...new Set(titles.flatMap((text) => [...text.matchAll(pattern)].map((match) => match[1].toUpperCase())))];
  return { titles, difficulties };
};
