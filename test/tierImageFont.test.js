import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { getTierImageFontCss } from '../src/utils/tierImageFont.js';

const originalFetch = globalThis.fetch;
const originalFileReader = globalThis.FileReader;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.FileReader = originalFileReader;
});

test('embeds font data for all unique characters across multiple subsets', async () => {
  const stylesheetRequests = [];
  const fontRequests = [];
  globalThis.fetch = async (url) => {
    if (url instanceof URL) {
      stylesheetRequests.push(url);
      return {
        ok: true,
        text: async () => "@font-face{font-family:'IBM Plex Sans JP';src:url(https://fonts.test/a.woff2)}",
      };
    }
    fontRequests.push(url);
    return { ok: true, blob: async () => new Blob(['font'], { type: 'font/woff2' }) };
  };
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = 'data:font/woff2;base64,Zm9udA==';
      queueMicrotask(() => this.onload());
    }
  };

  const characters = Array.from({ length: 301 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  const css = await getTierImageFontCss({ textContent: characters.join('') + characters[0] });
  assert.equal(stylesheetRequests.length, 2);
  const requested = stylesheetRequests.flatMap((url) => [...url.searchParams.get('text')]);
  assert.deepEqual(new Set(requested), new Set([...characters, ' ', 'L']));
  assert.equal(fontRequests.length, 2);
  assert.equal((css.match(/data:font\/woff2;base64,Zm9udA==/g) || []).length, 2);
  assert.ok(!css.includes('https://fonts.test/a.woff2'));
});

test('rejects export when the font stylesheet cannot be loaded', async () => {
  globalThis.fetch = async () => ({ ok: false });
  await assert.rejects(getTierImageFontCss({ textContent: '灼熱' }), /font stylesheet/);
});
