import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';

import { PROFILE_URL } from '../src/features/rivalCrawler/bookmarklet.js';
import { EMPTY_BINDING } from '../src/utils/rivalCrawler.js';

let vite;
let RivalCollectionCard;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: RivalCollectionCard } = await vite.ssrLoadModule('/src/components/import/RivalCollectionCard.jsx'));
  const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.js');
  useAuthStore.getState().setUser({ id: 1, username: 'tester' });
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
    onEnqueue: () => {},
    onCancel: () => {},
    onUnlink: () => {},
    onRefresh: () => {},
    onStartRegistration: () => {},
    onCancelRegistration: () => {},
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

test('disabled backend points to CSV upload and offers no bookmarklet fallback', () => {
  const text = textOf(render({ status: { enabled: false, latestJob: null, cooldownUntil: null } }));
  assert.ok(text.includes('아래 CSV 업로드를 이용해 주세요'));
  assert.ok(!text.includes('기존 북마클릿'));
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

test('an account without a binding is never asked for an e-amusement cookie', () => {
  const html = render({ binding: null });
  const text = textOf(html);
  assert.ok(!html.includes('type="password"'));
  assert.ok(!html.includes('<input'));
  assert.ok(!text.includes('세션 쿠키'));
  assert.equal(button(html, '본인 코드 확인'), undefined);
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
  const enqueueHtml = render({ retryBlockedAction: 'enqueue' });
  assert.match(button(enqueueHtml, '내 기록 수집 요청'), /disabled=/);
  assert.doesNotMatch(button(enqueueHtml, '연결 해제'), /disabled=/);

  // A verify block left over from the controller has no button to disable any more.
  const verifyHtml = render({ binding: null, retryBlockedAction: 'verify' });
  assert.equal(button(verifyHtml, '본인 코드 확인'), undefined);
  assert.doesNotMatch(button(verifyHtml, '연결 시작'), /disabled=/);
});

const ATTEMPT_ID = '3f2a9c1e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';
const registeredBinding = { iidxId: '1234-5678', verified: false, verifiedAt: null, registered: true,
  source: 'BOOKMARKLET', registeredAt: '2026-10-06T02:04:05Z' };
const unlinked = { binding: { ...EMPTY_BINDING }, registration: null };
const pendingAttempt = { status: 'PENDING', attemptId: ATTEMPT_ID, expiresAt: '2026-10-06T02:05:00Z', retryAt: null };

test('a REGISTERED bookmarklet link can collect and shows its source without the verified badge or any link form', () => {
  const html = render({ binding: registeredBinding });
  const text = textOf(html);
  assert.doesNotMatch(button(html, '내 기록 수집 요청'), /disabled=/);
  assert.ok(text.includes('연결된 IIDX ID'));
  assert.ok(text.includes('1234-5678'));
  assert.ok(text.includes('북마클릿'));
  assert.ok(text.includes('연결 시각'));
  assert.ok(!text.includes('확인됨'));
  assert.equal(button(html, '연결 시작'), undefined);
  assert.ok(!html.includes('type="password"'));
  assert.ok(!text.includes('서버 시각 · 시간대 미확정'), 'registeredAt is a UTC instant, not a server local time');
});

test('a VERIFIED cookie link shows the verified badge', () => {
  const html = render({ binding: { iidxId: '1234-5678', verified: true, verifiedAt: null, registered: true, source: 'EAGATE_SESSION', registeredAt: null } });
  assert.ok(textOf(html).includes('확인됨'));
  assert.doesNotMatch(button(html, '내 기록 수집 요청'), /disabled=/);
});

test('an unlinked account cannot collect and is offered only the bookmarklet link', () => {
  const html = render(unlinked);
  const text = textOf(html);
  assert.match(button(html, '내 기록 수집 요청'), /disabled=/);
  assert.ok(button(html, '연결 시작'));
  assert.doesNotMatch(button(html, '연결 시작'), /disabled=/);
  assert.ok(text.includes('북마클릿을 실행하면 이 계정에 IIDX 코드가 연결됩니다'));
  // zustand v5 serves its initial state to server rendering, so the username itself
  // cannot appear here; the browser check covers it. Only the account line is asserted.
  assert.ok(text.includes('현재 사이트 계정'), 'the current site account line is shown');
  // The cookie check is not offered on this screen at all, folded away or not.
  assert.ok(!html.includes('<details'));
  assert.ok(!html.includes('type="password"'));
  assert.ok(!text.includes('쿠키로 본인 확인'));
});

test('the profile link appears only for a PENDING attempt, opens safely, and never exposes the attemptId', () => {
  const idle = render(unlinked);
  assert.ok(!idle.includes(PROFILE_URL));
  assert.ok(!button(idle, '시도 취소'));

  const html = render({ binding: { ...EMPTY_BINDING }, registration: pendingAttempt });
  const anchor = (html.match(/<a\b[^>]*>/g) || []).find((tag) => tag.includes(`href="${PROFILE_URL}"`));
  assert.ok(anchor, 'profile link is rendered');
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
  assert.ok(button(html, '시도 취소'));
  assert.ok(button(html, '다시 시작'));
  assert.equal(button(html, '연결 시작'), undefined);
  assert.ok(!html.includes(ATTEMPT_ID));
});

test('the start button is disabled while rate-limited, while a job is active, or when the feature is off', () => {
  assert.doesNotMatch(button(render(unlinked), '연결 시작'), /disabled=/);

  const blocked = render({ ...unlinked, registrationBlockedUntil: Date.parse('2026-10-06T02:30:00Z') });
  assert.match(button(blocked, '연결 시작'), /disabled=/);
  assert.ok(textOf(blocked).includes('다시 시작 가능 시각'));
  assert.ok(!textOf(render(unlinked)).includes('다시 시작 가능 시각'));

  const active = render({ ...unlinked, status: { enabled: true, latestJob: { status: 'QUEUED' }, cooldownUntil: null } });
  assert.match(button(active, '연결 시작'), /disabled=/);

  const off = render({ ...unlinked, status: { enabled: false, latestJob: null, cooldownUntil: null } });
  assert.match(button(off, '연결 시작'), /disabled=/);
});

test('server rendering leaves the bookmarklet anchor without an href so no javascript: URL is in the HTML', () => {
  const html = render(unlinked);
  assert.ok(!html.includes('javascript:'));
  const anchor = (html.match(/<a\b[^>]*>\s*IIDX 코드 연결\s*<\/a>/) || [])[0];
  assert.ok(anchor, 'the draggable bookmarklet anchor is rendered');
  assert.doesNotMatch(anchor, /href=/);
});
