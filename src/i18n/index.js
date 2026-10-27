import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import ko from '../locales/ko/index.js';
import { isRealBrowser } from './environment.js';
import {
  BASE_LANGUAGE,
  FALLBACK_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
} from './languages.js';

const NAMESPACE = 'translation';

// ko is bundled (it is the base language and the last fallback). The others
// are separate chunks, fetched only when that language is in use, so the first
// screen does not pay for translations nobody reads.
const LAZY_BUNDLES = {
  ja: () => import('../locales/ja/index.js'),
  en: () => import('../locales/en/index.js'),
};

// Outside a browser (node:test, jsdom, scripts) there is no user to detect a
// language for, and those environments report navigator.language as en-US. Pin
// the base language so the Korean copy that existing tests assert on stays
// stable.
const inBrowser = isRealBrowser();

if (inBrowser) i18n.use(LanguageDetector);
i18n.use(initReactI18next);

i18n.init({
  resources: { ko: { [NAMESPACE]: ko } },
  lng: inBrowser ? undefined : BASE_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  // A missing key falls back to en, then ko. The base language has nothing to
  // fall back to, so a missing ko key surfaces as the key itself.
  fallbackLng: { ko: [], default: [FALLBACK_LANGUAGE, BASE_LANGUAGE] },
  defaultNS: NAMESPACE,
  ns: [NAMESPACE],
  // Resources are in memory (ko) or added before first render, so init can be
  // synchronous and t() works as soon as this module has been imported.
  initAsync: false,
  interpolation: { escapeValue: false }, // React escapes text itself.
  react: { useSuspense: false },
  detection: {
    // The user's explicit pick wins, then the browser language. Anything that
    // is not supported resolves to FALLBACK_LANGUAGE through fallbackLng.
    order: ['localStorage', 'navigator'],
    lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    // Never cache automatically: only an explicit choice (setLanguage) is
    // persisted, so a browser-language guess does not become a stored pick.
    caches: [],
  },
});

// Tracked here rather than asked of i18next: a stray addResource() for a key
// would make hasResourceBundle() true while the real bundle is still unloaded.
const loadedBundles = new Set();

async function loadBundle(language) {
  if (language === BASE_LANGUAGE || loadedBundles.has(language)) return;
  const loaded = await LAZY_BUNDLES[language]();
  i18n.addResourceBundle(language, NAMESPACE, loaded.default, true, true);
  loadedBundles.add(language);
}

/** Loads the bundles `language` needs: itself plus the en fallback. */
export async function ensureLanguageLoaded(language) {
  const code = normalizeLanguage(language) ?? FALLBACK_LANGUAGE;
  if (code === BASE_LANGUAGE) return;
  await Promise.all([...new Set([code, FALLBACK_LANGUAGE])].map(loadBundle));
}

function syncDocument(language) {
  if (!inBrowser) return;
  const code = normalizeLanguage(language) ?? BASE_LANGUAGE;
  document.documentElement.lang = code;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', i18n.t('common.meta.description'));
}

i18n.on('languageChanged', syncDocument);

/**
 * Resolves once the detected language's bundles are loaded. Render after it:
 * a Korean flash before a Japanese or English first paint would be worse than
 * waiting for one small chunk. Korean never waits.
 */
export const i18nReady = ensureLanguageLoaded(i18n.language)
  // A failed chunk fetch (offline, stale deploy) must not leave a blank page.
  .catch(() => i18n.changeLanguage(BASE_LANGUAGE))
  // Re-run the language change so resolvedLanguage and the document attributes
  // reflect the bundles that have just arrived, and so a detected "ko-KR"
  // settles on "ko". Nothing is persisted.
  .then(() => i18n.changeLanguage(normalizeLanguage(i18n.language) ?? FALLBACK_LANGUAGE));

/**
 * Switches the UI language and remembers the choice. Loads the bundle first so
 * the screen never renders half-translated. Resolves false if the language is
 * unsupported or its bundle could not be loaded (the current one stays).
 */
export async function setLanguage(language) {
  const code = normalizeLanguage(language);
  if (!code) return false;
  try {
    await ensureLanguageLoaded(code);
  } catch {
    return false;
  }
  await i18n.changeLanguage(code);
  if (inBrowser) {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      // Storage can be blocked (private mode); the choice then lasts one visit.
    }
  }
  return true;
}

export default i18n;
