import test from 'node:test';
import assert from 'node:assert/strict';

import { describePlayCount } from '../src/utils/playCount.js';

const LOWER_BOUND_HINT = '이 채보만 친 횟수를 알 수 없어, 기록이 바뀐 플레이만 센 최솟값입니다.';

test('exact release count reads as a plain count, with no lower-bound hint', () => {
  assert.deepEqual(describePlayCount({
    playCount: 3,
    songPlayCount: 3,
    playCountRelease: '34',
    releasePlayCount: 3,
    releasePlayCountExact: true,
  }), {
    text: '34 선곡 3회 · 이 채보 3회',
    lowerBoundHint: null,
    cumulative: null,
  });
});

test('lower-bound release count is marked 이상 and carries the hint', () => {
  assert.deepEqual(describePlayCount({
    playCount: 3,
    songPlayCount: 9,
    playCountRelease: '34',
    releasePlayCount: 3,
    releasePlayCountExact: false,
  }), {
    text: '34 선곡 9회 · 이 채보 3회 이상',
    lowerBoundHint: LOWER_BOUND_HINT,
    cumulative: null,
  });
});

test('cumulative count appears only when earlier releases contributed, and never as exact', () => {
  const described = describePlayCount({
    playCount: 15,
    songPlayCount: 9,
    playCountRelease: '34',
    releasePlayCount: 9,
    releasePlayCountExact: true,
  });
  assert.equal(described.text, '34 선곡 9회 · 이 채보 9회');
  assert.equal(described.cumulative, '누적 15회 이상');
});

test('release label comes from playCountRelease, including an older release', () => {
  const described = describePlayCount({
    playCount: 7,
    songPlayCount: 5,
    playCountRelease: ' 33 ',
    releasePlayCount: 2,
    releasePlayCountExact: false,
  });
  assert.equal(described.text, '33 선곡 5회 · 이 채보 2회 이상');
});

test('old server: songPlayCount alone is not release data, so the legacy text stays', () => {
  // Servers before the play-count-exactness change already send songPlayCount
  // but none of the three release keys.
  assert.equal(describePlayCount({ playCount: 15, songPlayCount: 9 }), null);
  assert.equal(describePlayCount({ playCount: 15 }), null);
});

test('crawler-only row (null release data) keeps the legacy text', () => {
  assert.equal(describePlayCount({
    playCount: 15,
    songPlayCount: null,
    playCountRelease: null,
    releasePlayCount: null,
    releasePlayCountExact: false,
  }), null);
});

test('blank release label or non-integer chart count is treated as no release data', () => {
  assert.equal(describePlayCount({ playCount: 4, playCountRelease: '  ', releasePlayCount: 4 }), null);
  assert.equal(describePlayCount({ playCount: 4, playCountRelease: '34', releasePlayCount: '4' }), null);
  assert.equal(describePlayCount(null), null);
});

test('crawler-counted play (selection count cleared) drops only the 선곡 part and stays a lower bound', () => {
  assert.deepEqual(describePlayCount({
    playCount: 3,
    songPlayCount: null,
    playCountRelease: '34',
    releasePlayCount: 3,
    releasePlayCountExact: false,
  }), {
    text: '34 이 채보 3회 이상',
    lowerBoundHint: LOWER_BOUND_HINT,
    cumulative: null,
  });
});

test('a selection count smaller than the chart count is stale and left out', () => {
  // A chart can't be played more often than its song was selected. This only
  // shows up when an older CSV is re-uploaded after the crawler counted plays.
  assert.deepEqual(describePlayCount({
    playCount: 6,
    songPlayCount: 5,
    playCountRelease: '34',
    releasePlayCount: 6,
    releasePlayCountExact: false,
  }), {
    text: '34 이 채보 6회 이상',
    lowerBoundHint: LOWER_BOUND_HINT,
    cumulative: null,
  });
});

test('exactness follows the server flag rather than being recomputed', () => {
  // A missing flag is not proof of exactness, even if the counts line up.
  assert.equal(describePlayCount({
    playCount: 3,
    songPlayCount: 3,
    playCountRelease: '34',
    releasePlayCount: 3,
  }).text, '34 선곡 3회 · 이 채보 3회 이상');
});
