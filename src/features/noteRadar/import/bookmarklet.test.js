import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers';
import { JSDOM } from 'jsdom';
import { radarBookmarkletHref, radarBookmarkletSource } from './bookmarklet.js';
import { PARSER_SOURCE, PARSER_VERIFIED, PROFILE_PARSER_SOURCE } from './parserSource.js';
import { PROFILE_URL, RADAR_URL, readRadarMessage, readReadyMessage } from './protocol.js';
import { ATTEMPT, FRONTEND, documentOf, payload, plain, profileHtml, radarHtml } from './fixtures.test.js';

const parse = (html) => runInNewContext(`(${PARSER_SOURCE})`)(documentOf(html));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const ready = () => ({ type: 'IIDX_RADAR_READY', version: 1, attemptId: ATTEMPT });

test('verified parser reads all six SP tables including hidden tabs and decodes titles', () => {
  assert.equal(PARSER_VERIFIED, true);
  const actual = plain(parse(radarHtml()));
  assert.deepEqual(actual, payload().categories);
  assert.equal(actual[0].entries[0].externalId, null, 'temporary index=0 is never used as a stable id');
  assert.ok(plain(parse(radarHtml({ empty: true }))).every((item) => item.value === 0 && item.entries.length === 0));
});

test('missing categories, malformed rows, DP rows, duplicates, and unknown layout fail closed', () => {
  const html = radarHtml();
  const cases = [
    html.replace('SOF-LAN', 'OTHER'),
    html.replace('<td class="no">10</td>', '<td class="no">11</td>'),
    html.replace('SP ANOTHER', 'DP ANOTHER'),
    html.replace('140.00', '140.000'),
    html.replace('<th>楽曲名</th>', '<th>新しい列</th>'),
    html.replace('<td>-</td><td>-</td><td>-</td>', '<td>100.00</td><td><a class="music_info">Synthetic &amp; Test</a></td><td>SP HYPER</td>'),
    '<div id="error-page"><div class="error_login"></div></div>',
  ];
  cases.forEach((item) => assert.throws(() => parse(item)));
});

test('profile parser requires one unambiguous ID and never uses unrelated page text', () => {
  const read = runInNewContext(`(${PROFILE_PARSER_SOURCE})`);
  assert.equal(read(documentOf(profileHtml('12345678'))), '1234-5678');
  assert.throws(() => read(documentOf(profileHtml() + profileHtml('8765-4321'))));
  assert.throws(() => read(documentOf('<p>IIDX ID 1234-5678</p>')));
});

function run({ href = RADAR_URL, html = radarHtml(), blocked = false, fetchProfile } = {}) {
  const messages = new Set();
  const posted = [];
  const alerts = [];
  const requests = [];
  const timers = [];
  const dom = new JSDOM('');
  const popup = { closed: false, postMessage: (data, origin) => posted.push({ data: plain(data), origin }) };
  const win = {
    location: { href }, document: documentOf(html), DOMParser: dom.window.DOMParser, AbortController,
    alert: (message) => alerts.push(message),
    open: () => blocked ? null : popup,
    fetch: (url, options) => {
      requests.push({ url, options });
      return fetchProfile ? fetchProfile() : Promise.resolve({ ok: true, url: PROFILE_URL, text: () => Promise.resolve(profileHtml()) });
    },
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { if (timer) timer.cleared = true; },
    setInterval: (callback) => { const timer = { callback }; timers.push(timer); return timer; },
    clearInterval: (timer) => { if (timer) timer.cleared = true; },
    addEventListener: (_type, fn) => messages.add(fn), removeEventListener: (_type, fn) => messages.delete(fn),
  };
  runInNewContext(radarBookmarkletSource(FRONTEND), { window: win });
  return { popup, posted, alerts, requests, timers, send: (data = ready(), overrides = {}) =>
    [...messages].forEach((fn) => fn({ origin: FRONTEND, source: popup, data, ...overrides })) };
}

test('exact bookmarklet source sends only bounded structured fields to the intended popup once', async () => {
  const h = run();
  h.send(ready(), { origin: 'https://evil.example' });
  h.send(ready(), { source: {} });
  h.send({ ...ready(), cookie: 'forbidden' });
  assert.equal(h.posted.length, 0);
  h.send();
  await tick();
  h.send();
  assert.deepEqual(h.posted, [{ data: { type: 'IIDX_RADAR_DATA', version: 1, attemptId: ATTEMPT, payload: payload() }, origin: FRONTEND }]);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, PROFILE_URL);
  assert.equal(h.requests[0].options.credentials, 'same-origin');
  assert.equal(h.requests[0].options.redirect, 'error');
  assert.ok(!JSON.stringify(h.posted).includes('html'));
  assert.equal(h.alerts.length, 0);
});

test('wrong URLs, popup blocks, expired waits, and profile failures never send records', async () => {
  for (const href of [RADAR_URL + '?style=0', RADAR_URL.replace('/djdata/', '/rival/'), 'https://evil.example']) {
    const h = run({ href }); assert.equal(h.requests.length, 0); assert.equal(h.posted.length, 0);
  }
  const blocked = run({ blocked: true }); assert.equal(blocked.requests.length, 0);
  const slow = run({ fetchProfile: () => new Promise(() => {}) });
  slow.send(); slow.timers.find((timer) => timer.delay === 10000).callback(); await tick();
  assert.equal(slow.posted.length, 0); assert.equal(slow.alerts.length, 1);
  const missing = run({ fetchProfile: () => Promise.resolve({ ok: true, url: PROFILE_URL, text: () => Promise.resolve('<p>login</p>') }) });
  missing.send(); await tick(); assert.equal(missing.posted.length, 0); assert.equal(missing.alerts.length, 1);
  const severed = run({ fetchProfile: () => new Promise(() => {}) });
  severed.popup.closed = true; severed.timers.find((timer) => timer.delay === undefined).callback();
  severed.send(); await tick(); assert.equal(severed.posted.length, 0); assert.equal(severed.alerts.length, 1);
});

test('production href carries the exact source and rejects unsafe service origins', () => {
  assert.equal(decodeURIComponent(radarBookmarkletHref(FRONTEND).slice('javascript:'.length)), radarBookmarkletSource(FRONTEND));
  ['http://example.com', FRONTEND + '/', 'javascript:alert(1)', FRONTEND + '/path'].forEach((origin) => assert.equal(radarBookmarkletSource(origin), null));
});

test('strict schemas reject unknown keys, wrong attempts, partial lists, and temporary ids', () => {
  const message = { type: 'IIDX_RADAR_DATA', version: 1, attemptId: ATTEMPT, payload: payload() };
  assert.ok(readRadarMessage(message, ATTEMPT));
  assert.equal(readRadarMessage({ ...message, cookie: 'x' }, ATTEMPT), null);
  assert.equal(readRadarMessage(message, '87654321-1234-4234-8234-123456789abc'), null);
  const bad = payload(); bad.categories[0].entries[0].externalId = '0';
  assert.equal(readRadarMessage({ ...message, payload: bad }, ATTEMPT), null);
  assert.equal(readReadyMessage({ ...ready(), extra: true }), null);
  const partial = payload(); partial.categories.pop();
  assert.equal(readRadarMessage({ ...message, payload: partial }, ATTEMPT), null);
});
