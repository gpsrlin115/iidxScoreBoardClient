import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { setImmediate } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { getTierImageFontCss } from '../src/utils/tierImageFont.js';

const originalFetch = globalThis.fetch;
const originalFileReader = globalThis.FileReader;
const faces = [
  { family: 'IBM Plex Sans JP', weight: '400', style: 'normal', unicodeRange: 'U+704C-704C' },
  { family: 'Space Mono', weight: '400', style: 'normal', unicodeRange: 'U+4C-4C' },
];

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.FileReader = originalFileReader;
});

function makeCapture(load) {
  const { window } = new JSDOM(`
    <style>
      @font-face {
        font-family: 'IBM Plex Sans JP'; font-weight: 400; unicode-range: U+704C;
        src: url('/assets/japanese.woff2') format('woff2'), url('/assets/japanese.woff') format('woff');
      }
      @font-face {
        font-family: 'IBM Plex Sans JP'; font-weight: 400; unicode-range: U+AC00-D7A3;
        src: url('/assets/unused.woff2') format('woff2');
      }
      @font-face {
        font-family: 'Space Mono'; font-weight: 400; unicode-range: U+4C;
        src: url('/assets/mono.woff2') format('woff2');
      }
    </style>
    <main>
      <span data-tier-song-label="leggendaria"
        style="font-family: 'IBM Plex Sans JP', 'Gothic A1', sans-serif; font-weight: 400; font-style: normal">
        灼熱灼<span class="sr-only">채보</span>
      </span>
    </main>
  `, { url: 'https://iidxtier.test/tier-table' });
  const { document } = window;
  document.fonts = { load };
  const getStyle = window.getComputedStyle;
  window.getComputedStyle = (element, pseudo) => pseudo === '::after'
    ? { fontFamily: '"Space Mono", monospace', fontWeight: '400', fontStyle: 'normal' }
    : getStyle(element);

  return document.querySelector('main');
}

test('inlines only the matching site WOFF2 files, including the generated L marker', async () => {
  const loadRequests = [];
  const fetchRequests = [];
  const node = makeCapture(async (font, text) => {
    loadRequests.push({ font, text: text.trim() });
    return font.includes('ibm plex sans jp') ? [faces[0]] : [faces[1]];
  });
  globalThis.fetch = async (url) => {
    fetchRequests.push(url.href);
    return new Response('font');
  };
  globalThis.FileReader = class {
    async readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload();
    }
  };

  const css = await getTierImageFontCss(node, new AbortController().signal);
  assert.deepEqual(loadRequests, [
    { font: 'normal 400 1px "ibm plex sans jp", "gothic a1"', text: '灼熱' },
    { font: 'normal 400 1px "space mono"', text: 'L' },
  ]);
  assert.deepEqual(fetchRequests, ['https://iidxtier.test/assets/japanese.woff2', 'https://iidxtier.test/assets/mono.woff2']);
  assert.equal((css.match(/data:font\/woff2;base64,Zm9udA==/g) || []).length, 2);
  assert.match(css, /unicode-range:U\+704C/);
  assert.doesNotMatch(css, /https?:/);
});

test('allows the capture to use default fonts when an asset returns 404', async () => {
  const node = makeCapture(async () => [faces[0]]);
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(null, { status: 404 });
  };
  assert.equal(await getTierImageFontCss(node, new AbortController().signal), null);
  assert.equal(requests, 1);
});

test('allows the capture to use default fonts when the browser cannot load a font', async () => {
  const node = makeCapture(async () => { throw new Error('Font decoding failed'); });
  assert.equal(await getTierImageFontCss(node, new AbortController().signal), null);
});

test('stops waiting for a font at the deadline and skips embedding after a late load', async () => {
  let finishLoad;
  const load = new Promise((resolve) => { finishLoad = resolve; });
  const node = makeCapture(() => load);
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(null);
  };

  assert.equal(await getTierImageFontCss(node, new AbortController().signal, 10), null);
  finishLoad([faces[0]]);
  await setImmediate();
  assert.equal(requests, 0);
});
