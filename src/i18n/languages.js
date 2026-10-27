// Single source of truth for the languages the client ships. `ko` is the
// base language: it is bundled into the main chunk and every other language
// falls back to it last. The rest are loaded on demand (see ./index.js).
export const SUPPORTED_LANGUAGES = Object.freeze(['ko', 'ja', 'en']);
export const BASE_LANGUAGE = 'ko';
export const FALLBACK_LANGUAGE = 'en';

// localStorage key holding the language the user picked explicitly.
export const LANGUAGE_STORAGE_KEY = 'iidx.language';

// Each language is named in itself, so the picker stays readable no matter
// which language is active.
export const LANGUAGE_LABELS = Object.freeze({
  ko: '한국어',
  ja: '日本語',
  en: 'English',
});

// BCP 47 tags handed to Intl.* so numbers and dates follow the UI language.
export const LOCALE_TAGS = Object.freeze({
  ko: 'ko-KR',
  ja: 'ja-JP',
  en: 'en-US',
});

/**
 * Maps any language tag ("ja-JP", "EN_us", "ko") to a supported language
 * code, or null when the language is not shipped.
 *
 * @param {unknown} tag
 * @returns {'ko' | 'ja' | 'en' | null}
 */
export function normalizeLanguage(tag) {
  if (typeof tag !== 'string') return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(primary) ? primary : null;
}
