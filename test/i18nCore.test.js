import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import i18n, { setLanguage, i18nReady } from '../src/i18n/index.js';
import { currentLocale, formatDate, formatDateTime, formatNumber, formatTime } from '../src/i18n/format.js';
import { dateFnsLocale } from '../src/i18n/dateFnsLocale.js';
import { normalizeLanguage } from '../src/i18n/languages.js';

afterEach(async () => {
  await setLanguage('ko');
});

test('tests run in ko so the Korean assertions elsewhere stay valid', async () => {
  await i18nReady;
  assert.equal(i18n.language, 'ko');
  assert.equal(i18n.t('auth.login.submit'), '로그인');
});

test('normalizeLanguage accepts regional tags and rejects everything else', () => {
  assert.equal(normalizeLanguage('ja-JP'), 'ja');
  assert.equal(normalizeLanguage('EN_us'), 'en');
  assert.equal(normalizeLanguage('ko'), 'ko');
  assert.equal(normalizeLanguage('fr'), null);
  assert.equal(normalizeLanguage('__proto__'), null);
  assert.equal(normalizeLanguage(undefined), null);
});

test('setLanguage loads the lazy bundle before switching', async () => {
  assert.equal(i18n.hasResourceBundle('ja', 'translation'), false);
  assert.equal(await setLanguage('ja'), true);
  assert.equal(i18n.language, 'ja');
  assert.equal(i18n.t('auth.login.submit'), 'ログイン');
  assert.equal(await setLanguage('en'), true);
  assert.equal(i18n.t('auth.login.submit'), 'Log in');
});

test('setLanguage refuses unsupported languages and keeps the current one', async () => {
  assert.equal(await setLanguage('fr'), false);
  assert.equal(i18n.language, 'ko');
});

test('a key missing in ja falls back to en, then to ko', async () => {
  i18n.addResource('en', 'translation', 'probe.onlyEn', 'EN copy');
  i18n.addResource('ko', 'translation', 'probe.onlyEn', 'KO copy');
  i18n.addResource('ko', 'translation', 'probe.onlyKo', 'KO only');
  await setLanguage('ja');
  assert.equal(i18n.t('probe.onlyEn'), 'EN copy');
  assert.equal(i18n.t('probe.onlyKo'), 'KO only');
});

test('number and date helpers follow the active language', async () => {
  const moment = new Date(2026, 9, 28, 15, 4, 5);
  assert.equal(currentLocale(), 'ko-KR');
  assert.equal(formatNumber(1234567), '1,234,567');
  await setLanguage('ja');
  assert.equal(currentLocale(), 'ja-JP');
  assert.equal(formatDate(moment), moment.toLocaleDateString('ja-JP'));
  await setLanguage('en');
  assert.equal(currentLocale(), 'en-US');
  assert.equal(formatTime(moment), moment.toLocaleTimeString('en-US'));
});

test('Korean output matches what the hard-coded ko-KR calls produced', () => {
  const moment = new Date(2026, 9, 28, 15, 4, 5);
  assert.equal(formatNumber(1234567.5), (1234567.5).toLocaleString('ko-KR'));
  assert.equal(formatDate(moment), moment.toLocaleDateString('ko-KR'));
  assert.equal(formatTime(moment), moment.toLocaleTimeString('ko-KR'));
  assert.equal(
    formatDateTime(moment),
    new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(moment),
  );
});

test('formatDateTime returns null for unusable input so callers pick the placeholder', () => {
  assert.equal(formatDateTime('not a date'), null);
  assert.equal(formatDateTime(undefined), null);
});

test('date-fns locale tracks the active language', async () => {
  assert.equal(dateFnsLocale().code, 'ko');
  await setLanguage('ja');
  assert.equal(dateFnsLocale().code, 'ja');
  await setLanguage('en');
  assert.equal(dateFnsLocale().code, 'en-US');
});

test('only a real browser gets language detection', async () => {
  const { isRealBrowser } = await import('../src/i18n/environment.js');
  const saved = { window: globalThis.window, document: globalThis.document };
  try {
    assert.equal(isRealBrowser(), false, 'plain Node');
    globalThis.document = { cookie: '' };
    assert.equal(isRealBrowser(), false, 'a stub with only document.cookie');
    globalThis.window = { navigator: { userAgent: 'Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/29.0.0' } };
    globalThis.document = { documentElement: {} };
    assert.equal(isRealBrowser(), false, 'jsdom');
    globalThis.window = { navigator: { userAgent: 'Mozilla/5.0 Chrome/130.0 Safari/537.36' } };
    assert.equal(isRealBrowser(), true, 'a browser');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});
