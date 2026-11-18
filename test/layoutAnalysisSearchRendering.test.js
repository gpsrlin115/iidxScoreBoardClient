import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement, useEffect, useState } from 'react';
import { createServer } from 'vite';
import { describeOcr } from '../src/features/layoutAnalysis/ocrStatus.js';

let dom, vite, root, container, createRoot, AnalysisStatus, useCandidateSearch, api, client, realFindCandidates, search;
const ocr = { titles: [], difficulties: ['ANOTHER'], artists: ['dj TAKA'], raw: ['dj TAKA'] };

before(async () => {
  dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
  ({ default: AnalysisStatus } = await vite.ssrLoadModule('/src/components/layout-analysis/AnalysisStatus.jsx'));
  ({ useCandidateSearch } = await vite.ssrLoadModule('/src/features/layoutAnalysis/useCandidateSearch.js'));
  ({ layoutAnalysisApi: api } = await vite.ssrLoadModule('/src/api/layoutAnalysis.js'));
  ({ default: client } = await vite.ssrLoadModule('/src/api/client.js'));
  realFindCandidates = api.findCandidates;
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
  delete globalThis.HTMLElement;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const Harness = () => {
  const [status, setStatus] = useState(describeOcr(ocr));
  const value = useCandidateSearch({ setStatus });
  useEffect(() => { search = value; }, [value]);
  return createElement(AnalysisStatus, { status, progress: 30 });
};
const render = () => act(async () => root.render(createElement(Harness)));
const statusNode = () => container.querySelector('[role=status]');

test('artist-only OCR is announced, with progress outside the live region', async () => {
  await render();
  assert.match(statusNode().textContent, /dj TAKA.*아티스트로 찾습니다/);
  assert.equal(statusNode().getAttribute('aria-atomic'), 'true');
  assert.equal(statusNode().querySelector('progress'), null);
  assert.equal(container.querySelector('progress').getAttribute('aria-label'), '분석 진행률');
  assert.equal(container.querySelector('[role=alert]'), null);
});

test('manual search and difficulty retain their request fields and announce all warnings', async () => {
  let sent;
  const candidate = { title: 'R5', textageChartKey: 'r5:SP:ANOTHER' };
  api.findCandidates = async (input) => {
    sent = input;
    return { candidates: [candidate], warnings: ['아티스트만으로 여러 곡이 검색되었습니다.', '난이도를 확인하세요.'] };
  };
  await render();
  await act(async () => search.setSelected(candidate));
  const input = { videoId: null, query: 'R5', ...ocr, difficulty: 'ANOTHER' };
  await act(async () => search.findCandidates(input));
  assert.deepEqual(sent, input);
  assert.deepEqual(search.candidates, [candidate]);
  assert.equal(search.selected, null);
  assert.match(statusNode().textContent, /정확한 곡과 채보.*여러 곡.*난이도를 확인/);
  assert.equal(statusNode().getAttribute('aria-atomic'), 'true');
});

test('empty searches and server failures remain visible without compatibility retries', async () => {
  await render();
  api.findCandidates = async () => ({ candidates: [], warnings: ['직접 검색하세요.'] });
  await act(async () => search.findCandidates({}));
  assert.equal(statusNode().textContent, '직접 검색하세요.');
  let calls = 0;
  api.findCandidates = async () => { calls += 1; throw { appError: { message: '지원하지 않는 요청입니다.' } }; };
  await act(async () => search.findCandidates({ artists: ocr.artists }));
  assert.equal(statusNode().textContent, '지원하지 않는 요청입니다.');
  assert.equal(calls, 1);
});


test('candidate API serializes artist hints and manual filters into the actual request', async () => {
  const adapter = client.defaults.adapter;
  let sent;
  client.defaults.adapter = async (config) => {
    sent = config;
    return { data: { candidates: [] }, status: 200, statusText: 'OK', headers: {}, config };
  };
  try {
    await realFindCandidates({ videoId: 'r5-video', query: 'R5', titles: ['RS', 'R5'],
      difficulties: ['ANOTHER', 'BEGINNER'], artists: ['dj TAKA'], difficulty: 'ANOTHER' });
    assert.equal(sent.url, '/layout-analyses/candidates');
    assert.deepEqual(sent.params, { catalog: 'TEXTAGE', difficulty: 'ANOTHER' });
    assert.deepEqual(JSON.parse(sent.data), { videoId: 'r5-video', query: 'R5',
      screenOcr: { titles: ['RS', 'R5'], difficulties: ['ANOTHER'], artists: ['dj TAKA'] } });
    await realFindCandidates({ query: 'HARD BRAIN' });
    assert.equal(Object.hasOwn(JSON.parse(sent.data).screenOcr, 'artists'), false);
  } finally {
    client.defaults.adapter = adapter;
  }
});
