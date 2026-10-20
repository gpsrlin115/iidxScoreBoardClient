import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

// Mounted in jsdom so a real click reaches the request button with the chosen styles.
let dom, vite, RivalCollectionCard, root, container;

const state = {
  binding: { iidxId: '1234-5678', verified: false, verifiedAt: null, registered: true, source: 'BOOKMARKLET', registeredAt: null },
  status: { enabled: true, latestJob: null, cooldownUntil: null, jobs: [] },
  registration: null,
  loading: false,
  action: null,
  error: null,
  ready: true,
  retryBlockedAction: null,
  registrationBlockedUntil: null,
};

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: RivalCollectionCard } = await vite.ssrLoadModule('/src/components/import/RivalCollectionCard.jsx'));
});

beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
});

after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

async function mountCard(onEnqueue) {
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(RivalCollectionCard, {
    state, onEnqueue, onCancel: () => {}, onUnlink: () => {}, onRefresh: () => {},
    onStartRegistration: () => {}, onCancelRegistration: () => {},
  }))));
}

const requestButton = () => [...container.querySelectorAll('button')]
  .find((button) => button.textContent.includes('내 기록 수집 요청'));
const click = (element) => act(async () => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));

test('the request button sends SP·DP by default', async () => {
  const sent = [];
  await mountCard((styles) => sent.push(styles));
  assert.equal(requestButton().disabled, false);
  await click(requestButton());
  assert.deepEqual(sent, [['SP', 'DP']]);
});

test('choosing "DP만" sends only DP, and "SP만" only SP', async () => {
  const sent = [];
  await mountCard((styles) => sent.push(styles));
  await click(container.querySelector('input[type="radio"][value="DP"]'));
  await click(requestButton());
  await click(container.querySelector('input[type="radio"][value="SP"]'));
  await click(requestButton());
  assert.deepEqual(sent, [['DP'], ['SP']]);
});
