import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let vite;
let ScoreCard;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: ScoreCard } = await vite.ssrLoadModule('/src/components/scores/ScoreCard.jsx'));
});

after(async () => {
  await vite?.close();
});

const BASE_SCORE = {
  song: { title: 'Test Song', artist: 'Test Artist' },
  chart: { playStyle: 'SP', chartType: 'ANOTHER', level: 12 },
  bestScore: 2000,
  bestDjLevel: 'AA',
  bestClearType: 'HARD_CLEAR',
  bestMissCount: 4,
  lastPlayedAt: '2026-09-08T12:00:00',
  playCount: 15,
};

const render = (fields) => renderToStaticMarkup(createElement(ScoreCard, {
  score: { ...BASE_SCORE, ...fields },
}));

// Visible text only, so assertions don't depend on class names or markup.
const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('exact release count shows the selection count and a plain chart count', () => {
  const html = render({
    playCount: 9,
    songPlayCount: 9,
    playCountRelease: '34',
    releasePlayCount: 9,
    releasePlayCountExact: true,
  });
  const text = textOf(html);
  assert.ok(text.includes('34 선곡 9회 · 이 채보 9회'));
  assert.ok(!text.includes('이상'));
  assert.ok(!text.includes('plays'));
  assert.ok(!text.includes('누적'));
  assert.ok(!html.includes('title='));
});

test('lower-bound release count is marked 이상, with the cumulative count when it differs', () => {
  const html = render({
    songPlayCount: 9,
    playCountRelease: '34',
    releasePlayCount: 3,
    releasePlayCountExact: false,
  });
  const text = textOf(html);
  assert.ok(text.includes('34 선곡 9회 · 이 채보 3회 이상'));
  assert.ok(text.includes('누적 15회 이상'));
  assert.ok(!text.includes('plays'));
  assert.ok(html.includes('title="선곡 회수를 채보별로 나눌 수 없어, 기록이 바뀐 플레이만 센 최솟값입니다."'));
});

test('old server without the release keys keeps the legacy single line', () => {
  const html = render({ songPlayCount: 9 });
  const text = textOf(html);
  assert.ok(text.includes('miss 4 plays 15 26/09/08'));
  assert.ok(!text.includes('선곡'));
  assert.ok(!text.includes('채보'));
  assert.ok(!html.includes('font-mono-ko'));
});

test('crawler-only row with null release data keeps the legacy single line', () => {
  const html = render({
    songPlayCount: null,
    playCountRelease: null,
    releasePlayCount: null,
    releasePlayCountExact: false,
  });
  const text = textOf(html);
  assert.ok(text.includes('miss 4 plays 15 26/09/08'));
  assert.ok(!text.includes('선곡'));
  assert.ok(!text.includes('채보'));
});
