const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const gray = (data, index) => data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;

export const defaultGeometry = (width, height) => {
  const x = Math.round(width * 0.038);
  const y = Math.round(height * 0.02);
  const fieldWidth = Math.round(width * 0.23);
  const fieldHeight = Math.round(height * 0.68);
  const judgementY = y + Math.round(fieldHeight * 0.96);
  const visibleTopY = y + Math.round(fieldHeight * 0.25);
  const visibleBottomY = judgementY - Math.max(8, Math.round(fieldHeight * 0.03));
  return {
    x, y, width: fieldWidth, height: fieldHeight, judgementY,
    visibleTopY, visibleBottomY,
    analysisY: Math.round((visibleTopY + visibleBottomY) / 2),
    source: 'browser-auto-fallback', confidence: 0.35,
  };
};

export const detectGeometry = (video) => {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('영상 프레임을 아직 읽을 수 없습니다.');
  const scale = Math.min(1, 960 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const profile = [];
  for (let x = 2; x < canvas.width * 0.58; x += 2) {
    let sum = 0;
    let count = 0;
    for (let y = Math.round(canvas.height * 0.08); y < canvas.height * 0.82; y += 4) {
      const at = (y * canvas.width + x) * 4;
      sum += Math.abs(gray(image.data, at) - gray(image.data, at - 8));
      count += 1;
    }
    profile.push({ x, score: sum / Math.max(1, count) });
  }
  const peaks = profile.sort((a, b) => b.score - a.score).slice(0, 50);
  let best = null;
  for (const left of peaks) {
    for (const right of peaks) {
      const fieldWidth = right.x - left.x;
      if (fieldWidth < canvas.width * 0.12 || fieldWidth > canvas.width * 0.4) continue;
      const lane = fieldWidth / 8;
      let grid = 0;
      for (let index = 0; index <= 8; index += 1) {
        const target = left.x + lane * index;
        const near = profile.reduce((value, item) => Math.abs(item.x - target) < Math.abs(value.x - target) ? item : value, profile[0]);
        grid += near.score;
      }
      const score = grid / 9;
      if (!best || score > best.score) best = { left: left.x, width: fieldWidth, score };
    }
  }
  if (!best) return defaultGeometry(width, height);
  const base = defaultGeometry(width, height);
  const ratio = 1 / scale;
  const x = Math.round(best.left * ratio);
  const fieldWidth = Math.round(best.width * ratio);
  return { ...base, x, width: fieldWidth, source: 'browser-auto-grid', confidence: clamp(0.55 + best.score / 200, 0.55, 0.82) };
};

export const sanitizeGeometry = (geometry, width, height) => {
  const x = clamp(Math.round(geometry.x), 0, width - 80);
  const y = clamp(Math.round(geometry.y), 0, height - 120);
  const fieldWidth = clamp(Math.round(geometry.width), 80, width - x);
  const fieldHeight = clamp(Math.round(geometry.height), 120, height - y);
  const judgementY = clamp(Math.round(geometry.judgementY), y, y + fieldHeight);
  const visibleTopY = clamp(Math.round(geometry.visibleTopY), y, judgementY - 12);
  const visibleBottomY = clamp(Math.round(geometry.visibleBottomY), visibleTopY + 12, judgementY);
  return { ...geometry, x, y, width: fieldWidth, height: fieldHeight, judgementY, visibleTopY, visibleBottomY, analysisY: Math.round((visibleTopY + visibleBottomY) / 2) };
};
