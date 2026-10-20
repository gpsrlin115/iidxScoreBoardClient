import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';
import { safeImportFailure, importError } from '../src/features/noteRadar/import/importErrors.js';

let vite, dom, root, container, ImportControl, ImportReview, ImportPage, auth, api, client;
const ATTEMPT = '12345678-1234-4234-8234-123456789abc';
const nextAttempt = '87654321-1234-4234-8234-123456789abc';
const pending = (attemptId = ATTEMPT) => ({ attemptId, status: 'PENDING', expiresAt: new Date(Date.now() + 60000).toISOString() });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const click = async (label) => act(async () => {
  const button = [...container.querySelectorAll('button')].find((node) => node.textContent === label);
  assert.ok(button, `missing button: ${label}`);
  button.click();
});
const render = (component, props) => act(async () => root.render(createElement(MemoryRouter, {}, createElement(component, props))));

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/note-radar' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ ImportControl } = await vite.ssrLoadModule('/src/features/noteRadar/import/ImportControl.jsx'));
  ({ ImportReview } = await vite.ssrLoadModule('/src/features/noteRadar/import/ImportReview.jsx'));
  ({ default: ImportPage } = await vite.ssrLoadModule('/src/pages/NoteRadarImport.jsx'));
  ({ useAuthStore: auth } = await vite.ssrLoadModule('/src/store/authStore.js'));
  ({ importsApi: api } = await vite.ssrLoadModule('/src/features/noteRadar/import/importsApi.js'));
  ({ default: client } = await vite.ssrLoadModule('/src/api/client.js'));
});
beforeEach(async () => {
  if (root) await act(async () => root.unmount());
  container = document.createElement('div');
  document.body.replaceChildren(container);
  root = createRoot(container);
  api.start = async () => pending();
  api.current = async () => ({ ...pending(), status: 'COMPLETED' });
});
after(async () => {
  if (root) await act(async () => root.unmount());
  await vite?.close();
  dom?.window.close();
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

test('unlinked import explains five steps and cannot start an attempt', async () => {
  let calls = 0;
  api.start = async () => { calls++; return pending(); };
  await render(ImportControl, { linked: false });
  assert.equal(container.querySelectorAll('ol > li').length, 5);
  assert.ok(container.querySelector('a[href="/import/csv"]'));
  const start = container.querySelector('button');
  assert.equal(start.disabled, true);
  await act(async () => start.click());
  assert.equal(calls, 0);
  assert.ok(!container.querySelector('input[type="password"]'));
});

test('the import popup keeps a clear loading and unauthenticated state', async () => {
  auth.setState({ user: null, isLoading: true });
  await render(ImportPage);
  assert.match(container.textContent, /로그인 확인 중/);
  await act(async () => auth.setState({ isLoading: false }));
  assert.match(container.textContent, /사이트 로그인이 필요/);
  assert.ok(container.querySelector('a[href="/login"]'));
});

test('completion callback fires once across rapid manual and focus checks', async () => {
  let imported = 0;
  await render(ImportControl, { iidxId: '12345678', onImported: () => imported++ });
  assert.match(container.textContent, /1234-5678/);
  await click('공식 레이더 가져오기');
  await act(async () => {
    window.dispatchEvent(new window.Event('focus'));
    window.dispatchEvent(new window.Event('focus'));
  });
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  assert.equal(imported, 1);
  assert.match(container.textContent, /공식 기록을 저장했습니다/);
});

test('a superseded request cannot mark the new attempt completed even if abort is ignored', async () => {
  let imported = 0;
  const oldCheck = deferred();
  api.current = () => oldCheck.promise;
  await render(ImportControl, { iidxId: '1234-5678', onImported: () => imported++ });
  await click('공식 레이더 가져오기');
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  api.start = async () => pending(nextAttempt);
  await click('새 가져오기 시작');
  await act(async () => oldCheck.resolve({ ...pending(), status: 'COMPLETED' }));
  assert.equal(imported, 0);
  assert.match(container.textContent, /북마클릿을 실행/);
});

test('a failed summary refresh does not turn a completed import into a save failure', async () => {
  await render(ImportControl, { iidxId: '1234-5678', onImported: async () => { throw new Error('refresh failed'); } });
  await click('공식 레이더 가져오기');
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  assert.match(container.textContent, /공식 기록은 저장했습니다/);
  assert.match(container.textContent, /현황을 불러오지 못했습니다/);
});

test('review requires matching connected code and explicit confirmation', async () => {
  let saved = 0;
  const payload = { release: '34', playStyle: 'SP', iidxId: '1234-5678', categories: ['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOFLAN'].map((category) => ({ category, value: 0, entries: [] })) };
  const props = { payload, user: { username: 'fixture' }, onConfirm: () => saved++ };
  await render(ImportReview, { ...props, binding: { linked: true, iidxId: '9999-9999' } });
  assert.equal(container.querySelector('button').disabled, true);
  assert.equal(container.querySelector('input').disabled, true);
  assert.match(container.textContent, /코드와 다릅니다/);
  await render(ImportReview, { ...props, binding: { linked: true, iidxId: '1234-5678' } });
  assert.equal(container.querySelector('button').disabled, true);
  await act(async () => container.querySelector('input').click());
  await click('확인한 공식 기록 저장');
  assert.equal(saved, 1);
  assert.match(container.textContent, /SOF-LAN/);
  assert.equal(container.querySelectorAll('li').length, 6);
});

test('API transport uses bodyless start, exact complete body, credentials and CSRF', async () => {
  // Use a fresh module object because component tests replace its functions.
  const { importsApi: realApi } = await vite.ssrLoadModule('/src/features/noteRadar/import/importsApi.js?transport');
  const calls = [];
  document.cookie = 'XSRF-TOKEN=radar%20csrf';
  client.defaults.adapter = async (config) => {
    calls.push(config);
    return { status: 200, data: {}, headers: {}, config };
  };
  await realApi.start();
  await realApi.current();
  await realApi.complete(ATTEMPT, { synthetic: true });
  assert.deepEqual(calls.map(({ method, url }) => [method, url]), [['post', '/note-radar/imports'], ['get', '/note-radar/imports/current'], ['post', '/note-radar/imports/complete']]);
  assert.equal(calls[0].data, undefined);
  assert.deepEqual(JSON.parse(calls[2].data), { attemptId: ATTEMPT, payload: { synthetic: true } });
  for (const config of calls) {
    assert.equal(config.withCredentials, true);
    assert.equal(config.headers.get('X-XSRF-TOKEN'), 'radar csrf');
  }
});

test('import errors retain a safe server explanation without Axios request data or nonce', () => {
  const safe = safeImportFailure({ config: { data: ATTEMPT }, request: { body: ATTEMPT }, response: { status: 409, data: { code: 'IIDX_ACCOUNT_MISMATCH', message: '연결 계정을 확인해 주세요.' } } });
  assert.equal(safe.config, undefined);
  assert.equal(safe.response, undefined);
  assert.equal(safe.request, undefined);
  assert.ok(!JSON.stringify(safe).includes(ATTEMPT));
  assert.match(importError(safe), /연결 계정을 확인/);
  assert.match(importError(safe), /코드가.*다릅니다/);
  const leaked = safeImportFailure({ response: { status: 409, data: { message: `시도 ${ATTEMPT}` } } });
  assert.equal(leaked.serverMessage, undefined);
  assert.match(importError({ code: 'NOTE_RADAR_DISABLED' }), /사용할 수 없습니다/);
  assert.match(importError({ code: 'SITE_LOGIN_REQUIRED' }), /로그인/);
});
