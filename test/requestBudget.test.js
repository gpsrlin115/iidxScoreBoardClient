import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import {
  BUDGET_FORBIDDEN,
  BUDGET_NOT_SUPPORTED,
  budgetErrorMessage,
  formatKst,
  formatRemaining,
  formatUtc,
  usageText,
} from '../src/utils/requestBudget.js';

const NOW = Date.parse('2026-10-07T00:00:00Z');
const MINUTE = 60 * 1000;
const at = (ms) => new Date(ms).toISOString();
const httpError = (status, data = {}) => ({ response: { status, data, headers: {} } });

test('UTC instants are shown in KST and UTC, including a time that moves the KST date forward', () => {
  assert.equal(formatKst('2026-10-07T15:30:00Z'), '2026-10-08 00:30:00');
  assert.equal(formatUtc('2026-10-07T15:30:00Z'), '2026-10-07 15:30:00');
  assert.equal(formatKst('2026-10-10T00:00:00Z'), '2026-10-10 09:00:00');
  assert.equal(formatKst('2026-10-07T15:30:00.123456Z'), '2026-10-08 00:30:00');
});

test('values without an offset, garbage, and missing times format to null', () => {
  for (const value of ['2026-10-07T15:30:00', 'not-a-date', '', null, undefined, 1791252245123]) {
    assert.equal(formatKst(value), null, String(value));
    assert.equal(formatUtc(value), null, String(value));
  }
});

test('time left is null once the block time has passed or is missing', () => {
  assert.equal(formatRemaining(at(NOW - MINUTE), NOW), null);
  assert.equal(formatRemaining(at(NOW), NOW), null);
  assert.equal(formatRemaining(null, NOW), null);
});

test('time left under a minute, exactly 72 hours, and mixed units', () => {
  assert.equal(formatRemaining(at(NOW + 30 * 1000), NOW), '1분 미만');
  assert.equal(formatRemaining(at(NOW + 59 * 1000), NOW), '1분 미만');
  assert.equal(formatRemaining(at(NOW + MINUTE), NOW), '1분');
  assert.equal(formatRemaining(at(NOW + 72 * 60 * MINUTE), NOW), '3일');
  assert.equal(formatRemaining(at(NOW + (26 * 60 + 3) * MINUTE), NOW), '1일 2시간 3분');
  assert.equal(formatRemaining(at(NOW + 45 * MINUTE + 59 * 1000), NOW), '45분');
});

test('usage shows used over budget and a dash for missing numbers', () => {
  assert.equal(usageText(0, 500), '0 / 500');
  assert.equal(usageText(40, 3000), '40 / 3,000');
  assert.equal(usageText(null, undefined), '- / -');
});

test('404 and 403 get fixed copy even when the server sends its own text', () => {
  assert.equal(budgetErrorMessage(httpError(404, { message: 'No static resource admin/crawler' })), BUDGET_NOT_SUPPORTED);
  assert.equal(budgetErrorMessage(httpError(403, { error: 'Forbidden', message: 'Access Denied' })), BUDGET_FORBIDDEN);
});

test('other failures follow toAppError: fixed copy for 5xx and the network, never server internals', () => {
  const server = budgetErrorMessage(httpError(500, { message: 'java.lang.IllegalStateException at com.iidx...' }));
  assert.doesNotMatch(server, /java|com\.iidx/);
  assert.match(budgetErrorMessage({ code: 'ERR_NETWORK' }), /연결할 수 없습니다/);
  // The interceptor already normalised the error; that copy wins.
  assert.equal(budgetErrorMessage({ response: { status: 500 }, appError: { message: 'already normalised' } }), 'already normalised');
});

let vite;
let RequestBudgetPanel;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ default: RequestBudgetPanel } = await vite.ssrLoadModule('/src/components/admin/RequestBudgetPanel.jsx'));
});

after(async () => {
  await vite?.close();
});

const BLOCKED = {
  blocked: true,
  blockedUntil: '2026-10-10T00:00:00Z',
  nextAllowedAt: '2026-10-07T00:00:05Z',
  hourUsed: 3,
  hourlyBudget: 500,
  hourResetAt: '2026-10-07T01:00:00Z',
  dayUsed: 40,
  dailyBudget: 3000,
  dayResetAt: '2026-10-08T00:00:00Z',
  maxUpstreamBackoffHours: 72,
};

const render = (budget, props = {}) => renderToStaticMarkup(createElement(RequestBudgetPanel, {
  budget, nowMs: NOW, loading: false, releasing: false, onRefresh: () => {}, onRelease: () => {}, ...props,
}));
const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const button = (html, label) => (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [])
  .find((candidate) => textOf(candidate).includes(label));

test('a blocked budget shows KST and UTC block time, time left, the cap, and the release button', () => {
  const html = render(BLOCKED);
  const text = textOf(html);
  assert.ok(text.includes('차단 중'));
  assert.ok(text.includes('2026-10-10 09:00:00'));
  assert.ok(text.includes('UTC 2026-10-10 00:00:00'));
  assert.ok(text.includes('3일'));
  assert.ok(text.includes('최대 72시간'));
  assert.ok(text.includes('3 / 500'));
  assert.ok(text.includes('40 / 3,000'));
  assert.ok(text.includes('2026-10-07 09:00:05 KST'), 'next allowed time in KST');
  assert.ok(button(html, '차단 해제'));
  assert.doesNotMatch(button(html, '차단 해제'), /disabled=/);
});

test('the server flag alone decides the block: no release button when blocked is false', () => {
  // A stale future blockedUntil must not resurrect the button on the browser clock.
  const html = render({ ...BLOCKED, blocked: false });
  assert.ok(textOf(html).includes('차단 없음'));
  assert.equal(button(html, '차단 해제'), undefined);
  assert.ok(!textOf(html).includes('남은 시간'));
});

test('release and refresh are locked while a release or read is in flight', () => {
  const releasing = render(BLOCKED, { releasing: true });
  assert.match(button(releasing, '해제 중'), /disabled=/);
  assert.match(button(releasing, '새로고침'), /disabled=/);
  const loading = render(BLOCKED, { loading: true });
  assert.match(button(loading, '차단 해제'), /disabled=/);
});
