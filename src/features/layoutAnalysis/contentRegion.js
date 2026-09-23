const COLORS = [
  [255, 0, 255], [0, 255, 80], [0, 210, 255], [255, 235, 0],
];

const matches = (data, offset, color) => Math.abs(data[offset] - color[0]) <= 32
  && Math.abs(data[offset + 1] - color[1]) <= 36
  && Math.abs(data[offset + 2] - color[2]) <= 32
  && data[offset + 3] >= 240;

/** Locate the four fiducials around the dedicated player, never by OCR. */
export const detectContentRect = ({ data, width, height }, onDiagnostic = () => {}) => {
  const stride = 2;
  const gridWidth = Math.ceil(width / stride);
  const gridHeight = Math.ceil(height / stride);
  const labels = new Uint8Array(gridWidth * gridHeight);
  for (let row = 0; row < gridHeight; row += 1) {
    for (let column = 0; column < gridWidth; column += 1) {
      const offset = (Math.min(height - 1, row * stride) * width + Math.min(width - 1, column * stride)) * 4;
      const color = COLORS.findIndex((candidate) => matches(data, offset, candidate));
      labels[row * gridWidth + column] = color + 1;
    }
  }
  const found = Array.from({ length: COLORS.length }, () => []);
  const visited = new Uint8Array(labels.length);
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    if (!label || visited[index]) continue;
    const pending = [index];
    visited[index] = 1;
    let count = 0;
    let minX = gridWidth;
    let maxX = 0;
    let minY = gridHeight;
    let maxY = 0;
    for (let at = 0; at < pending.length; at += 1) {
      const cell = pending[at];
      const x = cell % gridWidth;
      const y = Math.floor(cell / gridWidth);
      count += 1;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const neighbor of [x > 0 ? cell - 1 : -1, x + 1 < gridWidth ? cell + 1 : -1,
        y > 0 ? cell - gridWidth : -1, y + 1 < gridHeight ? cell + gridWidth : -1]) {
        if (neighbor >= 0 && !visited[neighbor] && labels[neighbor] === label) {
          visited[neighbor] = 1;
          pending.push(neighbor);
        }
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (count >= 12 && count <= 400 && boxWidth <= 25 && boxHeight <= 25
      && boxWidth / boxHeight >= 0.7 && boxWidth / boxHeight <= 1.5
      && count / (boxWidth * boxHeight) >= 0.65) {
      found[label - 1].push({ x: minX * stride, y: minY * stride,
        right: Math.min(width, (maxX + 1) * stride), bottom: Math.min(height, (maxY + 1) * stride), count });
    }
  }
  onDiagnostic(found.map((boxes) => boxes.map(({ x, y, right, bottom, count }) => ({ x, y, right, bottom, count }))));
  if (found.some((boxes) => boxes.length !== 1)) return null;
  const [topLeft, topRight, bottomLeft, bottomRight] = found.map((boxes) => boxes[0]);
  const tolerance = Math.max(8, Math.round(Math.min(width, height) * 0.015));
  if (Math.abs(topLeft.y - topRight.y) > tolerance
    || Math.abs(bottomLeft.y - bottomRight.y) > tolerance
    || Math.abs(topLeft.x - bottomLeft.x) > tolerance
    || Math.abs(topRight.x - bottomRight.x) > tolerance) return null;
  const x = Math.max(topLeft.right, bottomLeft.right);
  const y = Math.max(topLeft.bottom, topRight.bottom);
  const right = Math.min(topRight.x, bottomRight.x);
  const bottom = Math.min(bottomLeft.y, bottomRight.y);
  const rect = { x, y, width: right - x, height: bottom - y };
  if (rect.width < 240 || rect.height < 135 || rect.width / rect.height < 1.6
    || rect.width / rect.height > 2) return null;
  return rect;
};

export const validContentRect = (rect, width, height) => rect
  && Number.isInteger(rect.x) && Number.isInteger(rect.y)
  && Number.isInteger(rect.width) && Number.isInteger(rect.height)
  && rect.x >= 0 && rect.y >= 0 && rect.width >= 240 && rect.height >= 135
  && rect.x + rect.width <= width && rect.y + rect.height <= height;
