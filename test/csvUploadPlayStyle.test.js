import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

let dom, vite, CsvUpload, api, scope, tier, root, container;
let uploads, refreshes;

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: CsvUpload } = await vite.ssrLoadModule('/src/pages/CsvUpload.jsx'));
  ({ importApi: api } = await vite.ssrLoadModule('/src/api/import.js'));
  ({ useScopeStore: scope } = await vite.ssrLoadModule('/src/store/scopeStore.js'));
  ({ default: tier } = await vite.ssrLoadModule('/src/store/tierStore.js'));
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  uploads = [];
  refreshes = [];
  api.uploadCsv = async (file, style) => {
    uploads.push([file.name, style]);
    return { songsImported: 0, chartsImported: 0, scoresImported: 0, scoresUpdated: 0 };
  };
  scope.setState({ level: 12, playStyle: 'SP' });
  tier.setState({ fetchTierData: (...args) => refreshes.push(args) });
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(CsvUpload))));
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const button = (label) => [...container.querySelectorAll('button')]
  .find((element) => element.textContent.trim() === label);
const styleButton = (style) => [...container.querySelectorAll('[aria-pressed]')]
  .find((element) => element.textContent.trim() === style);
const selected = (style) => styleButton(style).getAttribute('aria-pressed') === 'true';
const click = (element) => act(async () => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
const file = (name, size = 1) => ({ name, size });

async function chooseFile(chosen) {
  const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: chosen ? [chosen] : [] });
  await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
}

async function dropFile(chosen) {
  const zone = container.querySelector('input[type="file"]').parentElement;
  const event = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [chosen] } });
  await act(async () => zone.dispatchEvent(event));
}

test('file picker and drop select SP or DP without changing the global style', async () => {
  await chooseFile(file('score_sP.csv'));
  assert.equal(selected('SP'), true);
  assert.equal(selected('DP'), false);
  assert.deepEqual(uploads, []);

  await dropFile(file('score_DP.CSV'));
  assert.equal(selected('SP'), false);
  assert.equal(selected('DP'), true);
  assert.equal(scope.getState().playStyle, 'SP');
  assert.deepEqual(uploads, []);

  await click(button('업로드'));
  assert.deepEqual(uploads, [['score_DP.CSV', 'DP']]);
  assert.deepEqual(refreshes, [[12, 'DP', { force: true }]]);
  assert.equal(scope.getState().playStyle, 'SP');
  await click(button('다른 파일 올리기'));
  assert.equal(selected('SP'), false);
  assert.equal(selected('DP'), false);
});

test('ambiguous names clear the prior selection and manual changes are sent', async () => {
  await chooseFile(file('score_sp.csv'));
  await chooseFile(file('score.csv'));
  assert.equal(selected('SP'), false);
  assert.equal(selected('DP'), false);
  assert.equal(button('SP · DP를 선택하세요').disabled, true);
  await click(styleButton('DP'));
  await chooseFile(file('score_sp_dp.csv'));
  assert.equal(selected('SP'), false);
  assert.equal(selected('DP'), false);
  await chooseFile(file('score_sp.csv'));
  await click(styleButton('DP'));
  await click(button('업로드'));
  assert.deepEqual(uploads, [['score_sp.csv', 'DP']]);
});

test('removal, canceled selection and invalid files handle the selection safely', async () => {
  await chooseFile(file('score_sp.csv'));
  await chooseFile(null);
  assert.equal(selected('SP'), true);
  await click(container.querySelector('[aria-label="선택한 파일 제거"]'));
  assert.equal(selected('SP'), false);
  await chooseFile(file('score_dp.csv'));
  await chooseFile(file('score.txt'));
  assert.equal(selected('DP'), false);
  assert.match(container.textContent, /CSV 파일만 올릴 수 있습니다/);
  assert.equal(button('다른 파일 선택').disabled, false);
  await chooseFile(file('score_sp.csv', 10 * 1024 * 1024 + 1));
  assert.equal(selected('SP'), false);
  assert.match(container.textContent, /10MB 이하만 올릴 수 있습니다/);
  assert.equal(button('다른 파일 선택').disabled, false);
  assert.deepEqual(uploads, []);
});
