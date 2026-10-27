// Compares the ja and en locale files against ko, the base language, and
// reports keys that are missing, extra, empty, or whose {{placeholders}}
// differ. Run with `npm run i18n:check`; it exits 1 when anything is off.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = 'ko';
const OTHERS = ['ja', 'en'];
const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
// i18next plural forms (`item_one`, `item_other`, ...) differ per language, so
// they are compared by their base key.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*([^}\s,]+)[^}]*\}\}/g;

/** Flattens `{ a: { b: 'x' } }` to `Map { 'a.b' => 'x' }` (leaf strings only). */
export function flatten(object, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
}

const baseKey = (key) => key.replace(PLURAL_SUFFIX, '');

function placeholders(text) {
  return typeof text === 'string'
    ? [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort()
    : [];
}

/**
 * @param {Record<string, Record<string, object>>} locales
 *   `{ ko: { auth: {...}, ... }, ja: {...}, en: {...} }` - language -> feature -> messages.
 * @returns {{ language: string, kind: string, key: string, detail?: string }[]}
 */
export function compareLocales(locales) {
  const flat = Object.fromEntries(
    Object.entries(locales).map(([language, features]) => [language, flatten(features)]),
  );
  const base = flat[BASE];
  const baseByPlain = new Map([...base].map(([key, text]) => [baseKey(key), text]));
  const problems = [];

  for (const language of OTHERS) {
    const messages = flat[language] ?? new Map();
    const byPlain = new Map([...messages].map(([key, text]) => [baseKey(key), text]));
    for (const [key, text] of baseByPlain) {
      if (!byPlain.has(key)) problems.push({ language, kind: 'missing', key });
      else if (placeholders(text).join() !== placeholders(byPlain.get(key)).join()) {
        problems.push({
          language, kind: 'placeholder', key,
          detail: `ko {{${placeholders(text)}}} vs ${language} {{${placeholders(byPlain.get(key))}}}`,
        });
      }
    }
    for (const [key, text] of messages) {
      if (!baseByPlain.has(baseKey(key))) problems.push({ language, kind: 'extra', key });
      if (typeof text === 'string' && text.trim() === '') problems.push({ language, kind: 'empty', key });
    }
  }
  return problems;
}

function loadLocales() {
  const locales = {};
  for (const language of [BASE, ...OTHERS]) {
    locales[language] = {};
    const dir = join(LOCALES_DIR, language);
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      locales[language][file.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    }
  }
  return locales;
}

export function checkLocales() {
  return compareLocales(loadLocales());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkLocales();
  if (problems.length === 0) {
    console.log('i18n keys: ja and en match ko.');
  } else {
    for (const { language, kind, key, detail } of problems) {
      console.error(`${language}  ${kind.padEnd(11)} ${key}${detail ? `  (${detail})` : ''}`);
    }
    console.error(`\n${problems.length} problem(s) found.`);
    process.exitCode = 1;
  }
}
