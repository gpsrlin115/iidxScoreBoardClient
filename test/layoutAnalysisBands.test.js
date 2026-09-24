import test from 'node:test';
import assert from 'node:assert/strict';
import { bandStrip, candidateBandsY, pickBand, scoreBand } from '../src/features/layoutAnalysis/analysisBands.js';

const geometry = { visibleTopY: 19, visibleBottomY: 328, height: 407, judgementY: 344 };

test('the candidate bands spread across the window where notes are visible', () => {
  // These are the rows the sidecar picked for the same capture, which is how
  // the port is checked: same geometry in, same rows out.
  assert.deepEqual(candidateBandsY(geometry), [78, 126, 174, 221, 269]);
});

test('a window too small to spread over is read at its middle', () => {
  const narrow = { visibleTopY: 100, visibleBottomY: 106, height: 400, judgementY: 300 };

  assert.deepEqual(candidateBandsY(narrow), [103]);
});

test('a band that left lanes silent loses to one that read them all', () => {
  // Four lanes reading nothing over a whole capture means the band sat under
  // something, which no amount of events in the other lanes makes up for.
  const blocked = scoreBand({
    laneEventCounts: [6, 6, 6, 6, 0, 0, 0, 0], events: Array.from({ length: 24 }, () => ({ quality: 1 })),
    bandY: 327, judgementY: geometry.judgementY, height: geometry.height,
  });
  const clear = scoreBand({
    laneEventCounts: [18, 79, 75, 86, 89, 87, 80, 75], events: Array.from({ length: 589 }, () => ({ quality: 0.5 })),
    bandY: 285, judgementY: geometry.judgementY, height: geometry.height,
  });

  assert.ok(clear > blocked, `${clear} should beat ${blocked}`);
});

test('a band close to the judgement line loses to one further up', () => {
  // Near the line the judgement flash is counted as notes, which shows up as
  // more events rather than fewer, so volume must not decide the choice.
  const counts = [30, 135, 109, 150, 135, 141, 118, 132];
  const nearLine = scoreBand({
    laneEventCounts: counts, events: Array.from({ length: 950 }, () => ({ quality: 0.5 })),
    bandY: 368, judgementY: 420, height: geometry.height,
  });
  const further = scoreBand({
    laneEventCounts: [18, 79, 75, 86, 89, 87, 80, 75], events: Array.from({ length: 589 }, () => ({ quality: 0.5 })),
    bandY: 202, judgementY: 420, height: geometry.height,
  });

  assert.ok(further > nearLine, `${further} should beat ${nearLine}`);
});

test('the best-scoring band is the one that is kept', () => {
  const bands = [{ bandY: 1, score: 3 }, { bandY: 2, score: 9 }, { bandY: 3, score: 7 }];

  assert.equal(pickBand(bands).bandY, 2);
  assert.equal(pickBand([{ bandY: 5, score: 1 }]).bandY, 5);
});

test('slicing one strip gives each band the rows it had when drawn alone', () => {
  // The worker used to draw each band out of the video frame separately, which
  // copied the frame out of the decoder once per band. The strip replaces that
  // with a single copy, and must not change a single pixel any band sees.
  const width = 7;
  const frameHeight = 60;
  const frame = new Uint8ClampedArray(width * frameHeight * 4);
  for (let index = 0; index < frame.length; index += 1) frame[index] = (index * 37) % 251;
  const rows = (top, count) => frame.subarray(top * width * 4, (top + count) * width * 4);

  for (const bandsY of [[10, 20, 30, 40, 50], [3, 30, 57], [25, 26, 27]]) {
    const bandHeight = 6;
    const { stripTop, stripHeight, offsets, tops } = bandStrip({ bandsY, bandHeight, frameHeight });
    const strip = rows(stripTop, stripHeight);

    assert.ok(stripTop >= 0 && stripTop + stripHeight <= frameHeight, JSON.stringify(bandsY));
    offsets.forEach((offset, index) => {
      const sliced = strip.subarray(offset * width * 4, (offset + bandHeight) * width * 4);
      assert.deepEqual(Array.from(sliced), Array.from(rows(tops[index], bandHeight)), `band ${index} of ${bandsY}`);
    });
  }
});

test('a band near either edge of the frame is pulled inside it', () => {
  const { tops, stripTop, stripHeight } = bandStrip({ bandsY: [1, 59], bandHeight: 8, frameHeight: 60 });

  assert.deepEqual(tops, [0, 52]);
  assert.equal(stripTop, 0);
  assert.equal(stripHeight, 60);
});
