const EXPORT_FAMILIES = new Set(['gothic a1', 'ibm plex sans jp', 'space grotesk', 'space mono']);
const FONT_TIMEOUT_MS = 5000;

const normalizeFamily = (family) => family.trim().replace(/^['"]|['"]$/g, '').toLowerCase();

const faceKey = (family, style, weight, range) => [
  normalizeFamily(family),
  style || 'normal',
  weight === 'normal' || !weight ? '400' : weight,
  (range || 'U+0-10FFFF').replace(/\s/g, '').toUpperCase(),
].join('|');

function collectFontText(node, view) {
  const textByFont = new Map();

  const add = (style, text) => {
    const families = style.fontFamily.split(',').map(normalizeFamily)
      .filter((family) => EXPORT_FAMILIES.has(family));
    if (!families.length) return;
    const font = `${style.fontStyle} ${style.fontWeight} 1px ${families.map((family) => `"${family}"`).join(', ')}`;
    const characters = textByFont.get(font) ?? new Set();
    for (const character of text) characters.add(character);
    if (style.textTransform === 'uppercase') {
      for (const character of text.toUpperCase()) characters.add(character);
    }
    textByFont.set(font, characters);
  };

  const walker = node.ownerDocument.createTreeWalker(node, view.NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.data.trim() || text.parentElement.closest('.sr-only')) continue;
    add(view.getComputedStyle(text.parentElement), text.data);
  }
  // The Leggendaria marker is CSS-generated, so it isn't a text node.
  for (const label of node.querySelectorAll('[data-tier-song-label="leggendaria"]')) {
    add(view.getComputedStyle(label, '::after'), ' L');
  }
  return textByFont;
}

function* fontFaceRules(rules, view) {
  for (const rule of rules) {
    if (rule.type === view.CSSRule.FONT_FACE_RULE) yield rule;
    else if (rule.cssRules) yield* fontFaceRules(rule.cssRules, view);
  }
}

function findFontAssets(doc, view, faces) {
  const assets = [];
  const missing = new Set(faces.map((face) => faceKey(
    face.family, face.style, face.weight, face.unicodeRange,
  )));
  for (const sheet of doc.styleSheets) {
    if (sheet.href && new URL(sheet.href, doc.baseURI).origin !== view.location.origin) continue;
    for (const { style } of fontFaceRules(sheet.cssRules, view)) {
      const family = style.getPropertyValue('font-family');
      const fontStyle = style.getPropertyValue('font-style');
      const weight = style.getPropertyValue('font-weight');
      const range = style.getPropertyValue('unicode-range');
      if (!missing.delete(faceKey(family, fontStyle, weight, range))) continue;

      const src = style.getPropertyValue('src')
        .match(/url\(\s*['"]?([^'")]+)['"]?\s*\)\s*format\(\s*['"]?woff2['"]?\s*\)/i)?.[1];
      if (!src) throw new Error('Missing tier image WOFF2 source');
      const url = new URL(src, sheet.href ?? doc.baseURI);
      if (url.origin !== view.location.origin && !url.href.startsWith('data:font/woff2;')) {
        throw new Error('Tier image fonts must come from the site');
      }
      const descriptors = ['font-family', 'font-style', 'font-weight', 'unicode-range']
        .map((name) => [name, style.getPropertyValue(name)])
        .filter(([, value]) => value)
        .map(([name, value]) => `${name}:${value};`).join('');
      assets.push({ url, descriptors });
    }
  }
  if (missing.size) throw new Error('Missing tier image font rules');
  return assets;
}

async function readFontData(url, signal) {
  if (url.protocol === 'data:') return url.href;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Failed to load tier image font');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([blob], { type: 'font/woff2' }));
  });
}

async function buildFontCss(node, signal) {
  const doc = node.ownerDocument;
  const view = doc.defaultView;
  const textByFont = collectFontText(node, view);
  // Let the browser match the weight and unicode-range for each text run.
  const faces = (await Promise.all([...textByFont].map(([font, characters]) =>
    doc.fonts.load(font, [...characters].join(''))))).flat();
  signal.throwIfAborted();
  if (!faces.length) return null;

  const dataByUrl = new Map();
  return (await Promise.all(findFontAssets(doc, view, faces).map(async ({ url, descriptors }) => {
    if (!dataByUrl.has(url.href)) dataByUrl.set(url.href, readFontData(url, signal));
    const dataUrl = await dataByUrl.get(url.href);
    return `@font-face{${descriptors}src:url("${dataUrl}") format("woff2");}`;
  }))).join('\n');
}

// SVG images need font bytes embedded, even when the page already loaded those fonts.
export async function getTierImageFontCss(node, signal, timeoutMs = FONT_TIMEOUT_MS) {
  if (signal.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  const cancelled = new Promise((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(null), { once: true });
  });

  try {
    return await Promise.race([buildFontCss(node, controller.signal), cancelled]);
  } catch {
    abort();
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
