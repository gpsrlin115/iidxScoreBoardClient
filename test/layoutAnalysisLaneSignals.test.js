import test from 'node:test';
import assert from 'node:assert/strict';
import { laneLayout } from '../src/features/layoutAnalysis/detector.js';
import { createEventDetector } from '../src/features/layoutAnalysis/laneEvents.js';

const DARK = [12, 12, 12];
const WHITE = [210, 210, 210];
const BLUE = [20, 70, 240];
const quietLanes = () => Array.from({ length: 8 }, () => DARK);
const during = (time, starts, length = 80) => starts.some((start) => time >= start && time < start + length);

// Paint complete lane interiors so each physical lane is sampled independently.
const bandImage = (colors, layout) => {
  const width = 290;
  const height = 12;
  const data = new Uint8ClampedArray(width * height * 4);
  const edges = layout.laneWidths.reduce((out, span) => [...out, out.at(-1) + span], [0]);
  for (let lane = 0; lane < 8; lane += 1) {
    const left = Math.round(edges[lane] * width);
    const right = Math.round(edges[lane + 1] * width);
    for (let y = 0; y < height; y += 1) {
      for (let x = left; x < right; x += 1) {
        const at = (y * width + x) * 4;
        data[at] = colors[lane][0];
        data[at + 1] = colors[lane][1];
        data[at + 2] = colors[lane][2];
        data[at + 3] = 255;
      }
    }
  }
  return { data, width, height };
};

const capture = (colorsAt, { fps = 60, seconds = 6, side = 'P1' } = {}) => {
  const layout = laneLayout(side);
  const detector = createEventDetector({ ...layout, durationMs: seconds * 1000, fps });
  for (let index = 0; index <= seconds * fps; index += 1) {
    const time = index * 1000 / fps;
    detector.push(bandImage(colorsAt(time), layout), time);
  }
  return detector.finish();
};

test('a dim white lane retains its notes beside a much brighter blue lane', () => {
  const notes = [1000, 3000, 5000];
  const background = [500, 1500, 2500, 3500, 4500];
  const result = capture((time) => {
    const colors = quietLanes();
    if (during(time, background)) colors[1] = colors[2] = [27, 27, 27];
    if (during(time, notes)) {
      colors[1] = [72, 72, 72];
      colors[2] = BLUE;
    }
    return colors;
  });
  assert.deepEqual(result.laneEventCounts, [0, 3, 3, 0, 0, 0, 0, 0]);
});

test('soft background pulses between genuine notes do not become extra notes', () => {
  const notes = [1000, 3000, 5000];
  const background = [250, 500, 750, 1250, 1500, 1750, 2250, 2500, 2750, 4250, 4500];
  const result = capture((time) => {
    const colors = quietLanes();
    if (during(time, background, 40)) colors[4] = [36, 36, 36];
    if (during(time, notes)) colors[4] = BLUE;
    return colors;
  });
  assert.deepEqual(result.laneEventCounts, [0, 0, 0, 0, 3, 0, 0, 0]);
  assert.deepEqual(result.events.map(({ timeMs }) => timeMs), notes);
});

test('seven-key chords plus scratch are retained on both play sides', () => {
  const notes = [1000, 2500, 4000];
  for (const side of ['P1', 'P2']) {
    const result = capture((time) => during(time, notes)
      ? Array.from({ length: 8 }, (_, lane) => lane % 2 ? BLUE : WHITE)
      : quietLanes(), { side });
    assert.deepEqual(result.laneEventCounts, Array(8).fill(3), side);
    for (const start of notes) {
      assert.equal(result.events.filter(({ timeMs }) => timeMs === start).length, 8, side);
    }
  }
});

test('subtle brightness changes below the noise floor remain silent', () => {
  const result = capture((time) => {
    const colors = quietLanes();
    if (during(time, [500, 1500, 2500, 3500, 4500])) colors[1] = [21, 21, 21];
    return colors;
  });
  assert.equal(result.events.length, 0);
});

test('a note changing from bright blue to white and back produces one onset', () => {
  const result = capture((time) => {
    const colors = quietLanes();
    for (const start of [1000, 3000, 5000]) {
      const phase = time - start;
      if (phase >= 0 && phase < 120) colors[3] = phase >= 40 && phase < 80 ? [180, 180, 180] : BLUE;
    }
    return colors;
  });
  assert.deepEqual(result.laneEventCounts, [0, 0, 0, 3, 0, 0, 0, 0]);
});

for (const fps of [30, 60]) {
  test(`${fps}fps: recurring notes keep one event per note at the sampled onset`, () => {
    const notes = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
    const result = capture((time) => {
      const colors = quietLanes();
      if (during(time, notes, 50)) colors[6] = WHITE;
      return colors;
    }, { fps, seconds: 5 });
    assert.deepEqual(result.laneEventCounts, [0, 0, 0, 0, 0, 0, 8, 0]);
    result.events.forEach((event, index) => assert.ok(Math.abs(event.timeMs - notes[index]) <= 1000 / fps));
    assert.ok(Math.abs(result.fps - fps) < 0.01);
  });
}
