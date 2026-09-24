import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let vite;
let SongTile;
let SongTileChip;
let TierSongChip;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: SongTile } = await vite.ssrLoadModule('/src/components/tier-table/SongTile.jsx'));
  ({ SongTileChip } = await vite.ssrLoadModule('/src/components/admin/SortableSongTile.jsx'));
  ({ default: TierSongChip } = await vite.ssrLoadModule('/src/components/tier-table/TierSongChip.jsx'));
});

after(async () => {
  await vite?.close();
});

const renderViewer = (difficulty) => renderToStaticMarkup(createElement(SongTile, {
  song: { title: 'Test Song', difficulty },
}));

// The shared tier table renders TierSongChip without `interactive`, so it has
// no aria-label from SongTile to name it — its sr-only text is the whole
// accessible name, and has to follow the same rules the viewer tiles do.
const renderShared = (difficulty) => renderToStaticMarkup(createElement(TierSongChip, {
  song: { title: 'Test Song', difficulty },
}));

test('viewer accessible name omits missing difficulty rather than reading an admin placeholder', () => {
  for (const difficulty of [undefined, null, '', '   ']) {
    const html = renderViewer(difficulty);
    assert.ok(html.includes('aria-label="Test Song 상세 점수 보기"'));
    assert.ok(!html.includes('? 채보'));
  }
});

test('viewer accessible name uses full chart names, including BEGINNER and NORMAL', () => {
  for (const difficulty of ['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA']) {
    assert.ok(renderViewer(difficulty).includes(`aria-label="Test Song ${difficulty} 채보 상세 점수 보기"`));
  }
});

test('viewer keeps normalized LEGGENDARIA marking and unknown difficulty text', () => {
  assert.ok(renderViewer(' leggendaria ').includes('> L</span>'));
  assert.ok(renderViewer('EXPERT').includes('aria-label="Test Song EXPERT 채보 상세 점수 보기"'));
});

test('shared read-only chip stays silent on a missing difficulty', () => {
  for (const difficulty of [undefined, null, '', '   ']) {
    const html = renderShared(difficulty);
    assert.ok(!html.includes('sr-only'));
    assert.ok(!html.includes('채보'));
    assert.ok(!html.includes('?'));
  }
});

test('shared read-only chip names full charts and keeps normalized LEGGENDARIA marking', () => {
  for (const difficulty of ['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA']) {
    assert.ok(renderShared(difficulty).includes(`class="sr-only"> ${difficulty} 채보</span>`));
  }

  const normalized = renderShared(' leggendaria ');
  assert.ok(normalized.includes('> L</span>'));
  assert.ok(normalized.includes('class="sr-only"> LEGGENDARIA 채보</span>'));
  assert.ok(renderShared('EXPERT').includes('class="sr-only"> EXPERT 채보</span>'));
});

test('admin retains the missing badge with a full description and a song-only container tooltip', () => {
  const html = renderToStaticMarkup(createElement(SongTileChip, { title: 'Test Song', difficulty: null }));
  assert.ok(html.startsWith('<div title="Test Song"'));
  assert.ok(html.includes('aria-hidden="true" title="난이도 정보 없음"'));
  assert.ok(html.includes('>?</span>'));
  assert.ok(html.includes('class="sr-only"> 난이도 정보 없음</span>'));
  assert.ok(!html.includes('난이도 난이도 정보 없음'));
});
