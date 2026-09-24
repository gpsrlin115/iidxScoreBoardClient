import test from 'node:test';
import assert from 'node:assert/strict';
import { detectContentRect, validContentRect } from '../src/features/layoutAnalysis/contentRegion.js';

const frame = (width, height) => {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y, w, h, color) => {
    for (let row = y; row < y + h; row += 1) {
      for (let column = x; column < x + w; column += 1) {
        const at = (row * width + column) * 4;
        data.set([...color, 255], at);
      }
    }
  };
  return { data, width, height, paint };
};

test('finds the player inside a full browser window at a nonzero offset', () => {
  const image = frame(1280, 800);
  const [x, y, w, h] = [78, 95, 1120, 630];
  image.paint(x, y, 14, 14, [255, 0, 255]);
  image.paint(x + w - 14, y, 14, 14, [0, 255, 80]);
  image.paint(x, y + h - 14, 14, 14, [0, 210, 255]);
  image.paint(x + w - 14, y + h - 14, 14, 14, [255, 235, 0]);
  // A visible banner and chrome are not allowed to become the content box.
  image.paint(78, 0, 1120, 40, [35, 35, 35]);
  image.paint(150, 140, 900, 500, [100, 95, 105]);
  image.paint(160, 280, 32, 7, [0, 210, 255]);
  const rect = detectContentRect(image);
  assert.ok(rect);
  assert.ok(Math.abs(rect.x - (x + 14)) <= 2);
  assert.ok(Math.abs(rect.y - (y + 14)) <= 2);
  assert.ok(Math.abs(rect.width - (w - 28)) <= 2);
  assert.ok(Math.abs(rect.height - (h - 28)) <= 2);
  assert.ok(validContentRect(rect, image.width, image.height));
});

test('missing or inconsistent markers require a manual selection', () => {
  const image = frame(960, 540);
  image.paint(10, 10, 14, 14, [255, 0, 255]);
  image.paint(936, 10, 14, 14, [0, 255, 80]);
  image.paint(10, 516, 14, 14, [0, 210, 255]);
  assert.equal(detectContentRect(image), null);
  image.paint(800, 516, 14, 14, [255, 235, 0]);
  assert.equal(detectContentRect(image), null);
});

test('manual rectangle stays inside captured pixels', () => {
  assert.ok(validContentRect({ x: 40, y: 60, width: 640, height: 360 }, 800, 600));
  assert.equal(validContentRect({ x: 200, y: 60, width: 640, height: 360 }, 800, 600), false);
  assert.equal(validContentRect({ x: 40, y: 60, width: 100, height: 100 }, 800, 600), false);
});
