import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import { card, response } from './fixtures/noteRadarTitleData.js';

// Components that only format dates keep the same props across a language
// switch, so they must subscribe through useLocale() to re-render.
const STAMP = '2026-10-18T09:00:00Z';
let dom, vite, root, container, createRoot, RadarGoalProgress, RadarTitleSong, setLanguage, formatDateTime;

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  ({ default: RadarGoalProgress } = await vite.ssrLoadModule('/src/features/noteRadar/RadarGoalProgress.jsx'));
  ({ default: RadarTitleSong } = await vite.ssrLoadModule('/src/features/noteRadar/RadarTitleSong.jsx'));
  // Load i18n through Vite too, so the switch reaches the instance the components read.
  ({ setLanguage } = await vite.ssrLoadModule('/src/i18n/index.js'));
  ({ formatDateTime } = await vite.ssrLoadModule('/src/i18n/format.js'));
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
});
afterEach(async () => {
  // node:test pins ko; put it back after a test switches.
  await act(async () => { await setLanguage('ko'); });
  await act(async () => root.render(null));
});
after(async () => {
  await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  for (const key of ['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) delete globalThis[key];
});

async function followsLanguage(element) {
  await act(async () => root.render(element));
  const ko = formatDateTime(STAMP);
  assert.ok(container.textContent.includes(ko), `expected the ko date ${ko}`);
  await act(async () => { assert.equal(await setLanguage('en'), true); });
  const en = formatDateTime(STAMP);
  assert.notEqual(en, ko);
  assert.ok(container.textContent.includes(en), `expected the en date ${en} without new props`);
  assert.ok(!container.textContent.includes(ko));
}

test('goal progress re-renders its timestamp when the language changes', async () => {
  await followsLanguage(createElement(RadarGoalProgress, {
    request: { kind: 'TITLE', goalTitle: 'DIAMOND', value: 120 },
    category: { current: 110, complete: true },
    data: response({ importedAt: STAMP }),
  }));
});

test('title card re-renders its record time when the language changes', async () => {
  await followsLanguage(createElement(RadarTitleSong, {
    song: card({ historicalBestExScore: 1400, historicalRecordUpdatedAt: STAMP, historicalComparability: 'UNVERIFIED' }),
    onSelect() {},
  }));
});
