import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';

const INDEX_URL = pathToFileURL(resolve(import.meta.dirname, '../src/i18n/index.js')).href;

// The i18n module is a singleton that detects the language once at import
// time, so each scenario runs in a fresh process with a fake browser.
function detect({ stored, languages }) {
  const script = `
    const store = new Map(${JSON.stringify(stored ? [['iidx.language', stored]] : [])});
    globalThis.document = { documentElement: { lang: '' }, querySelector: () => ({ setAttribute() {} }) };
    globalThis.window = { navigator: { userAgent: 'Mozilla/5.0 Chrome/130' }, localStorage: {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    } };
    Object.defineProperty(globalThis, 'navigator', { value: { language: ${JSON.stringify(languages[0])}, languages: ${JSON.stringify(languages)} }, configurable: true });
    const { default: i18n, i18nReady, setLanguage } = await import(${JSON.stringify(INDEX_URL)});
    await i18nReady;
    const first = { language: i18n.language, htmlLang: document.documentElement.lang, sample: i18n.t('auth.login.submit') };
    await setLanguage('en');
    console.log(JSON.stringify({ ...first, stored: store.get('iidx.language') }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').at(-1));
}

test('the language the user picked wins over the browser language', () => {
  const result = detect({ stored: 'ja', languages: ['ko-KR'] });
  assert.equal(result.language, 'ja');
  assert.equal(result.htmlLang, 'ja');
  assert.equal(result.sample, 'ログイン');
});

test('without a stored pick the browser language is used', () => {
  assert.equal(detect({ languages: ['ko-KR', 'en-US'] }).language, 'ko');
  assert.equal(detect({ languages: ['ja-JP'] }).language, 'ja');
  assert.equal(detect({ languages: ['en-GB'] }).language, 'en');
});

test('the first supported language in the browser list is used', () => {
  assert.equal(detect({ languages: ['fr-FR', 'ja-JP'] }).language, 'ja');
});

test('an unsupported browser language falls back to en', () => {
  const result = detect({ languages: ['fr-FR', 'de'] });
  assert.equal(result.language, 'en');
  assert.equal(result.sample, 'Log in');
  assert.equal(result.htmlLang, 'en');
});

test('an invalid stored value is ignored in favour of the browser language', () => {
  assert.equal(detect({ stored: 'xx', languages: ['ko-KR'] }).language, 'ko');
});

test('detecting a language does not persist it; only an explicit pick does', () => {
  assert.equal(detect({ languages: ['ja-JP'] }).stored, 'en');
  // The helper switches to en at the end, which is the explicit pick stored here.
});
