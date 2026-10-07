import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';

let vite;
let RivalCollectionCard;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: RivalCollectionCard } = await vite.ssrLoadModule('/src/components/import/RivalCollectionCard.jsx'));
});

after(async () => {
  await vite?.close();
});

const baseState = {
  binding: { iidxId: '1234-5678', verified: true, verifiedAt: null },
  status: { enabled: true, latestJob: null, cooldownUntil: null },
  loading: false,
  action: null,
  error: null,
  ready: true,
  retryBlockedAction: null,
};

const render = (state = {}) => renderToStaticMarkup(createElement(
  MemoryRouter,
  null,
  createElement(RivalCollectionCard, {
    state: { ...baseState, ...state },
    onVerify: () => {},
    onEnqueue: () => {},
    onCancel: () => {},
    onUnlink: () => {},
    onRefresh: () => {},
  }),
));

const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const button = (html, label) => {
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [];
  return buttons.find((candidate) => textOf(candidate).includes(label));
};

test('DONE states list collection and preserves the existing MISS COUNT', () => {
  const html = render({ status: { enabled: true, latestJob: { status: 'DONE' }, cooldownUntil: null } });
  const text = textOf(html);
  assert.ok(text.includes('목록 수집 완료'));
  assert.ok(text.includes('이번 수집은 MISS COUNT를 갱신하지 않으며 기존 기록은 유지됩니다'));
});

test('null progress fields are omitted instead of becoming zero or invented progress', () => {
  const html = render({ status: { enabled: true, latestJob: { status: 'RUNNING', pagesDone: null, pagesTotal: null, requestsDone: null, requestsEstimated: null, progressPercent: null, estimatedFinishAt: null }, cooldownUntil: null } });
  const text = textOf(html);
  assert.ok(text.includes('수집 중'));
  for (const absent of ['목록 페이지', '진행률', '예상 완료', '0 / 0']) assert.ok(!text.includes(absent), `${absent} should be omitted`);
  assert.ok(!html.includes('<dt '), 'empty optional job fields should not produce detail rows');
});

test('34 pages and 38 requests do not change a RUNNING status or enable duplicate enqueue', () => {
  const html = render({ status: { enabled: true, latestJob: { status: 'RUNNING', pagesDone: 34, pagesTotal: 34, requestsDone: 38, requestsEstimated: 38 }, cooldownUntil: null } });
  const text = textOf(html);
  assert.ok(text.includes('수집 중'));
  assert.ok(text.includes('34 / 34'));
  assert.ok(text.includes('38 / 38'));
  assert.match(button(html, '내 기록 수집 요청'), /disabled=/);
});

test('disabled backend points to CSV and existing bookmarklet fallback', () => {
  const text = textOf(render({ status: { enabled: false, latestJob: null, cooldownUntil: null } }));
  assert.ok(text.includes('CSV 업로드나 기존 북마클릿'));
  assert.ok(!text.includes('기능 활성화'));
});

test('active collection stays cancellable after feature disable and during a slow status read', () => {
  for (const enabled of [true, false]) {
    const html = render({ loading: true, ready: false,
      status: { enabled, latestJob: { status: 'RUNNING' }, cooldownUntil: null } });
    assert.ok(button(html, '수집 취소'));
    assert.doesNotMatch(button(html, '수집 취소'), /disabled=/);
    assert.doesNotMatch(button(html, '연결 해제'), /disabled=/);
    assert.ok(!textOf(html).includes('기능 활성화'));
  }
});

test('cooldown and server supplied enqueue retry block disable collection request', () => {
  const cooldownHtml = render({ status: { enabled: true, latestJob: null, cooldownUntil: '2026-10-06T12:30:00' } });
  assert.match(button(cooldownHtml, '내 기록 수집 요청'), /disabled=/);
  assert.ok(textOf(cooldownHtml).includes('2026-10-06 12:30:00'));

  const retryHtml = render({ retryBlockedAction: 'enqueue' });
  assert.match(button(retryHtml, '내 기록 수집 요청'), /disabled=/);
});

test('verified account shows its ID without asking for another cookie', () => {
  const html = render();
  const text = textOf(html);
  assert.ok(text.includes('1234-5678'));
  assert.ok(!text.includes('본인 e-amusement 세션 쿠키'));
  assert.ok(!html.includes('type="password"'));
});

test('unverified account uses a masked cookie input with autocomplete disabled', () => {
  const html = render({ binding: null });
  assert.match(html, /type="password"/);
  assert.match(html, /autoComplete="off"/);
});

test('FAILED, PARTIAL, and CANCELLED explain retry, possible saved rows, and retained scores', () => {
  const failed = textOf(render({ status: { enabled: true, latestJob: { status: 'FAILED', errorMessage: 'temporary failure' }, cooldownUntil: null } }));
  assert.ok(failed.includes('temporary failure'));
  assert.ok(failed.includes('수동으로 다시 요청할 수 있습니다'));

  const partial = textOf(render({ status: { enabled: true, latestJob: { status: 'PARTIAL' }, cooldownUntil: null } }));
  assert.ok(partial.includes('일부 기록이 저장됐을 수 있습니다'));

  const cancelled = textOf(render({ status: { enabled: true, latestJob: { status: 'CANCELLED' }, cooldownUntil: null } }));
  assert.ok(cancelled.includes('이미 저장된 기록은 삭제되지 않습니다'));
});

test('server local timestamps stay literal, and one timezone note covers binding and job timestamps', () => {
  const html = render({
    binding: { iidxId: '1234-5678', verified: true, verifiedAt: '2026-10-06T10:11:12' },
    status: { enabled: true, latestJob: { status: 'QUEUED', queuedAt: '2026-10-06T10:12:13' }, cooldownUntil: null },
  });
  const text = textOf(html);
  assert.ok(text.includes('2026-10-06 10:11:12'));
  assert.ok(text.includes('2026-10-06 10:12:13'));
  assert.ok(!text.includes('2026-10-06T10:12:13Z'));
  assert.equal((text.match(/서버 시각 · 시간대 미확정/g) || []).length, 1);
});

test('missing status API still shows a refresh action', () => {
  const html = render({ status: null, error: { status: 404, message: '내 기록 수집 작업 조회 API를 찾을 수 없습니다. 백엔드 배포 상태를 확인해주세요.' } });
  const text = textOf(html);
  assert.ok(text.includes('백엔드 배포 상태를 확인해주세요'));
  assert.ok(button(html, '연결·작업 상태 새로고침'));
});

test('actual retry-after blocks only its matching action', () => {
  const verifyHtml = render({ binding: null, retryBlockedAction: 'verify' });
  assert.match(button(verifyHtml, '본인 코드 확인'), /disabled=/);

  const enqueueHtml = render({ retryBlockedAction: 'enqueue' });
  assert.match(button(enqueueHtml, '내 기록 수집 요청'), /disabled=/);
  assert.doesNotMatch(button(enqueueHtml, '본인 코드 확인') || '', /disabled=/);
});
