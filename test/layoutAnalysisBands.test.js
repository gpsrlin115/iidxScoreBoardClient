import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateBandsY, pickBand, scoreBand } from '../src/features/layoutAnalysis/analysisBands.js';

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
