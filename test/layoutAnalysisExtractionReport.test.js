import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticsFile, describeExtraction, extractionAdvice } from '../src/features/layoutAnalysis/extractionReport.js';

/** What the matcher sends back with a clean answer. */
const healthy = {
  observedKeyEvents: 428, referenceKeyEventsInWindow: 470, observationCoverage: 0.910638,
  observedLaneCoverage: 7, incompleteExtraction: false,
  sideAssignmentP1: 0.41, sideAssignmentP2: 0.87, sideDecisionGap: 0.46,
  alignmentCorrelation: 0.83,
};

test('the numbers the matcher judged by are listed with the bar each had to clear', () => {
  // They arrive with every answer and were being dropped, so a failed capture
  // said only "extraction is incomplete" — which does not say whether one lane
  // went unread or the whole band did.
  const rows = describeExtraction(healthy);

  assert.ok(rows.length >= 4);
  assert.ok(rows.every((row) => row.ok !== false), JSON.stringify(rows));
  assert.ok(rows.some((row) => row.label.includes('비율') && row.requirement.includes('0.4')));
  assert.ok(rows.some((row) => row.label.includes('레인') && row.requirement.includes('7')));
});

test('a reading that missed the bar is marked, not just printed', () => {
  const rows = describeExtraction({ ...healthy, observationCoverage: 0.23, observedLaneCoverage: 5 });
  const failed = rows.filter((row) => row.ok === false).map((row) => row.label);

  assert.equal(failed.length, 2);
  assert.ok(failed.some((label) => label.includes('비율')));
  assert.ok(failed.some((label) => label.includes('레인')));
});

test('a play side the matcher could not call shows the gap it needed', () => {
  // Below 0.02 the matcher reports UNKNOWN rather than guessing.
  const row = describeExtraction({ ...healthy, sideDecisionGap: 0.004 })
    .find((candidate) => candidate.label.includes('1P/2P'));

  assert.equal(row.ok, false);
  assert.match(row.requirement, /0\.02/);
});

test('nothing is claimed when the answer carried no measurements', () => {
  assert.equal(describeExtraction(null), null);
  assert.equal(describeExtraction({}), null);
});

test('which test failed decides what the reader is told to check', () => {
  // A lane nobody read means the lane coordinates are off; every lane reading
  // thinly means the band or its threshold is.
  assert.match(
    extractionAdvice({ incompleteExtraction: true, observedLaneCoverage: 5, observationCoverage: 0.8 }),
    /X·폭/,
  );
  assert.match(
    extractionAdvice({ incompleteExtraction: true, observedLaneCoverage: 7, observationCoverage: 0.2 }),
    /판정선/,
  );
  assert.equal(extractionAdvice({ incompleteExtraction: false, observedLaneCoverage: 7 }), null);
  assert.equal(extractionAdvice(null), null);
});

test('the handover file carries the events and the answer, never the video', () => {
  const file = buildDiagnosticsFile({
    result: { status: 'AMBIGUOUS', diagnostics: healthy },
    observedNotes: { schemaVersion: 'observed-notes-v1', events: [{ timeMs: 1, lane: 0 }] },
    videoId: null,
  });
  const saved = JSON.parse(file.json);

  assert.match(file.name, /^layout-analysis-\d+\.json$/);
  assert.equal(saved.result.status, 'AMBIGUOUS');
  assert.equal(saved.observedNotes.events.length, 1);
  assert.doesNotMatch(file.json, /frame|blob|image|video(?!Id)/i);
});
