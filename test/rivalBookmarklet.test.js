import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runInNewContext, Script } from 'node:vm';

import {
  bookmarkletHref, bookmarkletSource, frontendOriginOf, readProfileMessage,
} from '../src/features/rivalCrawler/bookmarklet.js';

const FRONTEND = 'https://scoreboard.example';
const PROFILE_URL = 'https://p.eagate.573.jp/game/2dx/34/djdata/status.html';
const RIVAL_URL = 'https://p.eagate.573.jp/game/2dx/34/rival/rival_status.html?rival_id=synthetic';
const READY = { type: 'IIDX_LINK_READY', version: 1 };
const fixture = (name) => readFileSync(new URL(`./fixtures/iidx-profile/${name}`, import.meta.url), 'utf8');
// The bookmarklet runs in its own vm realm; compare its objects only after a JSON round trip.
const plain = (value) => JSON.parse(JSON.stringify(value));

// --- A tiny HTML -> element tree, enough for well-formed fixtures --------------------

const VOID_TAGS = new Set(['meta', 'br', 'img', 'hr', 'input', 'link']);
const NAMED_ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
  if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
  return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
});

function makeElement(tag, attrs, parent) {
  const element = { tagName: tag.toUpperCase(), attrs, parent, nodes: [] };
  Object.defineProperties(element, {
    children: { get: () => element.nodes.filter((node) => typeof node !== 'string') },
    textContent: { get: () => element.nodes.map((node) => (typeof node === 'string' ? decodeEntities(node) : node.textContent)).join('') },
  });
  return element;
}

function parseHtml(html) {
  const root = makeElement('#root', {}, null);
  let top = root;
  const token = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-z0-9]+)\s*>|<([a-z][a-z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/gi;
  for (const [, close, open, rawAttrs, selfClose, text] of html.matchAll(token)) {
    if (text !== undefined) {
      top.nodes.push(text);
    } else if (close) {
      assert.equal(top.tagName, close.toUpperCase(), `fixture HTML is unbalanced at </${close}>`);
      top = top.parent;
    } else if (open) {
      const attrs = {};
      for (const [, name, dq, sq, bare] of (rawAttrs ?? '').matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attrs[name.toLowerCase()] = dq ?? sq ?? bare ?? '';
      }
      const element = makeElement(open, attrs, top);
      top.nodes.push(element);
      if (!selfClose && !VOID_TAGS.has(open.toLowerCase())) top = element;
    }
  }
  assert.equal(top, root, 'fixture HTML leaves an element open');
  return root;
}

function queryRows(root, selector) {
  assert.equal(selector, 'div.dj-profile table tr', 'the test DOM supports only the selector the bookmarklet uses');
  const found = [];
  const inProfileTable = (row) => {
    const chain = [];
    for (let parent = row.parent; parent; parent = parent.parent) chain.push(parent);
    return chain.some((table, index) => table.tagName === 'TABLE' && chain.slice(index + 1)
      .some((div) => div.tagName === 'DIV' && (div.attrs.class ?? '').split(/\s+/).includes('dj-profile')));
  };
  const walk = (node) => node.children.forEach((child) => {
    if (child.tagName === 'TR' && inProfileTable(child)) found.push(child);
    walk(child);
  });
  walk(root);
  return found;
}

// --- Running the real bookmarklet string against a fake window ------------------------

function run({ href = PROFILE_URL, html = fixture('own-profile.html'), popup = { closed: false, posted: [] } } = {}) {
  if (popup) popup.postMessage = (data, targetOrigin) => popup.posted.push({ data, targetOrigin });
  const dom = parseHtml(html);
  const env = { alerts: [], opens: [], queries: 0, timers: [], listeners: [], popup };
  const addTimer = (kind) => (fn, delay) => { const timer = { kind, fn, delay, cleared: false }; env.timers.push(timer); return timer; };
  const clear = (timer) => { if (timer) timer.cleared = true; };
  const win = {
    location: { href },
    document: { querySelectorAll: (selector) => { env.queries += 1; return queryRows(dom, selector); } },
    open: (...args) => { env.opens.push(args); return popup; },
    alert: (message) => { env.alerts.push(message); },
    crypto: webcrypto,
    setTimeout: addTimer('timeout'),
    setInterval: addTimer('interval'),
    clearTimeout: clear,
    clearInterval: clear,
    addEventListener: (type, fn) => { env.listeners.push({ type, fn }); },
    removeEventListener: (type, fn) => { env.listeners = env.listeners.filter((entry) => !(entry.type === type && entry.fn === fn)); },
  };
  runInNewContext(bookmarkletSource(FRONTEND), { window: win });
  env.live = (kind) => env.timers.filter((timer) => timer.kind === kind && !timer.cleared);
  env.dispatch = (data, overrides = {}) => env.listeners.slice().forEach(({ fn }) => fn({ origin: FRONTEND, source: popup, data, ...overrides }));
  env.refused = () => {
    assert.equal(env.alerts.length, 1);
    assert.ok(env.alerts[0].startsWith('[IIDX 코드 연결]'));
    assert.equal(env.opens.length, 0, 'no window was opened');
    assert.equal(env.listeners.length, 0);
    assert.equal(env.timers.length, 0);
  };
  return env;
}

const profileHtml = (rows) => `<div class="dj-profile"><table>${rows}</table></div>`;
const row = (label, value) => `<tr><td>${label}</td><td>${value}</td></tr>`;

test('the test HTML helper builds tagName, element-only children, decoded text, and the profile selector', () => {
  const dom = parseHtml('<!DOCTYPE html><div class="dj-profile extra"><div><table><tr><th>IIDX&nbsp;ID</th><td> 1&amp;2 &amp;nbsp; </td></tr></table></div></div>'
    + '<div class="dj-profile-x"><table><tr><td>x</td></tr></table></div><table><tr><td>outside</td></tr></table><br><p>a<br/>b</p>');
  const rows = queryRows(dom, 'div.dj-profile table tr');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].children.map((cell) => cell.tagName), ['TH', 'TD']);
  assert.equal(rows[0].children[0].textContent, 'IIDX ID');
  assert.equal(rows[0].children[1].textContent, ' 1&2 &nbsp; ', 'entities decode once');
  assert.equal(rows[0].tagName, 'TR');
  assert.equal(parseHtml(fixture('own-profile.html')).children[0].tagName, 'HTML');
  assert.throws(() => parseHtml('<div><p></div>'));
});

test('the exact profile page opens one popup and answers READY with the four-key PROFILE message only', () => {
  const env = run();
  assert.equal(env.opens.length, 1);
  assert.equal(env.opens[0][0], 'https://scoreboard.example/crawler/iidx-link');
  assert.equal(env.opens[0][1], '_blank');
  assert.equal(typeof env.opens[0][2], 'string');
  assert.equal(env.alerts.length, 0);
  assert.equal(env.listeners.length, 1);
  assert.equal(env.popup.posted.length, 0, 'nothing is sent before the popup answers');
  env.dispatch(READY);
  assert.equal(env.popup.posted.length, 1);
  const [{ data, targetOrigin }] = env.popup.posted;
  assert.equal(targetOrigin, FRONTEND);
  assert.equal(Object.keys(data).length, 4);
  assert.match(data.runId, /^[0-9a-f]{32}$/);
  assert.deepEqual(plain(data), { type: 'IIDX_LINK_PROFILE', version: 1, runId: data.runId, iidxId: '1234-5678' });
  assert.deepEqual(readProfileMessage(plain(data)), { runId: data.runId, iidxId: '1234-5678' });
  assert.ok(!JSON.stringify(env.popup.posted).includes('SYNTH_DJ'), 'the DJ NAME is never sent');
  assert.equal(env.listeners.length, 0);
  assert.equal(env.live('timeout').length + env.live('interval').length, 0, 'both timers are cleared after the reply');
  env.timers.find((timer) => timer.kind === 'timeout').fn();
  assert.equal(env.alerts.length, 0, 'a stale timeout stays silent');
});

test('every run gets a fresh random runId', () => {
  const ids = new Set();
  for (let i = 0; i < 5; i += 1) {
    const env = run();
    env.dispatch(READY);
    ids.add(env.popup.posted[0].data.runId);
  }
  assert.equal(ids.size, 5);
});

test('only the exact profile URL runs; query, hash, scheme, host, path, and the rival page are refused before the DOM is read', () => {
  const refused = [`${PROFILE_URL}?a=1`, `${PROFILE_URL}?`, `${PROFILE_URL}#x`, `${PROFILE_URL}#`,
    PROFILE_URL.replace('https:', 'http:'), PROFILE_URL.replace('p.eagate', 'p2.eagate'),
    PROFILE_URL.replace('p.eagate.573.jp', 'evil.example'), `${PROFILE_URL}/`, PROFILE_URL.replace('.html', '.htm'),
    PROFILE_URL.replace('/34/', '/33/'), RIVAL_URL, 'about:blank', ''];
  for (const href of refused) {
    const env = run({ href });
    env.refused();
    assert.equal(env.queries, 0, `${href} must not reach the DOM`);
  }
  assert.equal(run({ href: PROFILE_URL }).opens.length, 1);
  const rival = run({ href: RIVAL_URL, html: fixture('rival-profile.html') });
  rival.refused();
  assert.equal(rival.queries, 0);
});

const ID_CASES = [
  ['own-profile.html', '1234-5678'],
  ['duplicate-same-id.html', '1234-5678'],
  ['nbsp-th-label.html', '1234-5678'],
  ['conflicting-ids.html', null],
  ['malformed-fullwidth.html', null],
  ['malformed-spaced.html', null],
];

test('profile fixtures: one well-formed ID is sent, anything ambiguous or malformed sends nothing', () => {
  for (const [name, expected] of ID_CASES) {
    const env = run({ html: fixture(name) });
    if (expected === null) {
      env.refused();
      assert.equal(env.queries, 1, name);
    } else {
      assert.equal(env.opens.length, 1, name);
      env.dispatch(READY);
      assert.equal(env.popup.posted[0].data.iidxId, expected, name);
    }
  }
});

test('only rows inside div.dj-profile with exactly two cells and an IIDX ID label count', () => {
  const accepted = [
    [profileHtml(row('IIDX ID', '12345678')), '1234-5678'],
    [profileHtml(row('iidx id', ' 1234-5678 ')), '1234-5678'],
    [profileHtml(row('DJ NAME', 'SYNTH_DJ') + row('IIDX ID', '1234-5678') + '<tr><td colspan="2">note</td></tr>'), '1234-5678'],
  ];
  const rejected = [
    '<table><tr><td>IIDX ID</td><td>1234-5678</td></tr></table>',
    '<div class="dj-profile-x"><table><tr><td>IIDX ID</td><td>1234-5678</td></tr></table></div>',
    profileHtml('<tr><td>IIDX ID</td><td>1234-5678</td><td>extra</td></tr>'),
    profileHtml(row('DJ NAME', 'SYNTH_DJ')),
    profileHtml(row('IIDX ID', 'ID: 1234-5678')),
    profileHtml(row('IIDX ID', '1234-5678') + row('IIDX ID', 'oops')),
    profileHtml(row('IIDX ID', '1234-5678') + row('IIDX ID', '8765-4321')),
  ];
  for (const [html, expected] of accepted) {
    const env = run({ html });
    env.dispatch(READY);
    assert.equal(env.popup.posted[0].data.iidxId, expected);
  }
  for (const html of rejected) run({ html }).refused();
});

test('a blocked popup alerts once and leaves no listener or timer behind', () => {
  const env = run({ popup: null });
  assert.equal(env.opens.length, 1);
  assert.equal(env.alerts.length, 1);
  assert.match(env.alerts[0], /차단/);
  assert.equal(env.listeners.length, 0);
  assert.equal(env.timers.length, 0);
});

const IGNORED_READY = [
  ['another origin', { origin: 'https://evil.example' }, READY],
  ['the origin with a trailing slash', { origin: `${FRONTEND}/` }, READY],
  ['the frontend over http', { origin: 'http://scoreboard.example' }, READY],
  ['the eagate origin', { origin: 'https://p.eagate.573.jp' }, READY],
  ['an empty origin', { origin: '' }, READY],
  ['same origin from another window', { source: { postMessage() {} } }, READY],
  ['same origin without a source', { source: null }, READY],
  ['an extra key', {}, { ...READY, extra: 1 }],
  ['a missing version', {}, { type: 'IIDX_LINK_READY' }],
  ['version 2', {}, { ...READY, version: 2 }],
  ['version as a string', {}, { ...READY, version: '1' }],
  ['another type', {}, { ...READY, type: 'IIDX_LINK_PROFILE' }],
  ['a lower-case type', {}, { ...READY, type: 'iidx_link_ready' }],
  ['an array', {}, ['IIDX_LINK_READY', 1]],
  ['null', {}, null],
  ['undefined', {}, undefined],
  ['a string', {}, 'IIDX_LINK_READY'],
];

test('READY from another origin, another window, or off the schema is ignored and the run keeps waiting', () => {
  const env = run();
  for (const [name, overrides, data] of IGNORED_READY) {
    env.dispatch(data, overrides);
    assert.equal(env.popup.posted.length, 0, name);
    assert.equal(env.listeners.length, 1, name);
    assert.equal(env.alerts.length, 0, name);
  }
  assert.equal(env.live('timeout').length, 1);
  env.dispatch(READY);
  assert.equal(env.popup.posted.length, 1);
  env.dispatch(READY);
  assert.equal(env.popup.posted.length, 1, 'a second READY is not answered');
});

test('without READY in 10 seconds the run alerts, detaches, and never sends PROFILE afterwards', () => {
  const env = run();
  const listener = env.listeners[0].fn;
  const [timeout] = env.live('timeout');
  assert.equal(timeout.delay, 10000);
  timeout.fn();
  assert.equal(env.alerts.length, 1);
  assert.match(env.alerts[0], /10초/);
  assert.equal(env.listeners.length, 0);
  assert.equal(env.live('interval').length, 0);
  env.dispatch(READY);
  listener({ origin: FRONTEND, source: env.popup, data: READY });
  assert.equal(env.popup.posted.length, 0);
  assert.equal(env.alerts.length, 1);
});

test('a closed popup stops the run on the next poll', () => {
  const env = run();
  const listener = env.listeners[0].fn;
  const [poll] = env.live('interval');
  assert.equal(poll.delay, 500);
  poll.fn();
  assert.equal(env.alerts.length, 0, 'an open popup keeps the run alive');
  env.popup.closed = true;
  poll.fn();
  assert.equal(env.alerts.length, 1);
  assert.match(env.alerts[0], /닫혔/);
  assert.equal(env.listeners.length, 0);
  assert.equal(env.live('timeout').length, 0);
  listener({ origin: FRONTEND, source: env.popup, data: READY });
  assert.equal(env.popup.posted.length, 0);
});

test('the bookmarklet source is self-contained ES5 with no network, storage, cookie, or HTML access', () => {
  const source = bookmarkletSource(FRONTEND);
  assert.doesNotThrow(() => new Script(source));
  for (const forbidden of ['eval', 'fetch', 'XMLHttpRequest', 'document.cookie', 'localStorage', 'sessionStorage',
    'sendBeacon', '<script', 'import(', 'innerHTML', 'outerHTML', 'WebSocket', 'DJ NAME']) {
    assert.ok(!source.includes(forbidden), `source must not contain ${forbidden}`);
  }
  assert.doesNotMatch(source, /=>|`|\blet\b|\bconst\b|\?\.|\?\?|\basync\b|\.\.\./);
  assert.ok(source.includes(JSON.stringify(FRONTEND)));
  assert.equal(source.split(PROFILE_URL).length, 2, 'the profile URL appears once');
});

test('bookmarkletHref is a javascript: URL that decodes back to the source and has no raw quote or space', () => {
  const href = bookmarkletHref(FRONTEND);
  assert.ok(href.startsWith('javascript:'));
  assert.equal(decodeURIComponent(href.slice('javascript:'.length)), bookmarkletSource(FRONTEND));
  assert.doesNotMatch(href, /["<>\s]/);
});

test('frontendOriginOf accepts https origins and loopback http only', () => {
  for (const ok of [FRONTEND, 'https://scoreboard.example:8443', 'http://localhost', 'http://localhost:5173', 'http://127.0.0.1:5173']) {
    assert.equal(frontendOriginOf(ok), ok);
    assert.ok(bookmarkletSource(ok).includes(JSON.stringify(ok)));
  }
  for (const bad of [`${FRONTEND}/`, `${FRONTEND}/path`, `${FRONTEND}?x=1`, `${FRONTEND}#x`, 'http://scoreboard.example',
    'http://localhost.evil.example', 'http://localhost:5173/', 'https://user:pw@scoreboard.example', 'HTTPS://SCOREBOARD.EXAMPLE',
    'ftp://scoreboard.example', 'javascript:alert(1)', 'garbage', '', null, undefined, 42]) {
    assert.equal(frontendOriginOf(bad), null, `should reject ${String(bad)}`);
    assert.equal(bookmarkletSource(bad), null);
    assert.equal(bookmarkletHref(bad), null);
  }
});

test('readProfileMessage accepts only the exact four-key PROFILE schema', () => {
  const good = { type: 'IIDX_LINK_PROFILE', version: 1, runId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', iidxId: '1234-5678' };
  assert.deepEqual(readProfileMessage(good), { runId: good.runId, iidxId: good.iidxId });
  const bad = [{ ...good, extra: 1 }, { type: good.type, version: 1, runId: good.runId }, { ...good, version: 2 },
    { ...good, version: '1' }, { ...good, type: 'IIDX_LINK_READY' }, { ...good, runId: good.runId.slice(1) },
    { ...good, runId: good.runId.toUpperCase() }, { ...good, runId: 'z'.repeat(32) }, { ...good, runId: 1 },
    { ...good, iidxId: '12345678' }, { ...good, iidxId: '１２３４-５６７８' }, { ...good, iidxId: ' 1234-5678' },
    { ...good, iidxId: null }, Object.assign(Object.create(null), good), [good], null, undefined, 'x', 7];
  for (const data of bad) assert.equal(readProfileMessage(data), null, JSON.stringify(data));
});
