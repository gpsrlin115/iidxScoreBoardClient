import i18n from './index.js';
import { BASE_LANGUAGE, LOCALE_TAGS, normalizeLanguage } from './languages.js';

/** BCP 47 tag of the active UI language, for Intl.* and toLocale*String. */
export const currentLocale = () => (
  LOCALE_TAGS[normalizeLanguage(i18n.language) ?? BASE_LANGUAGE]
);

/** Locale-aware number; callers keep their own "-" for non-finite input. */
export const formatNumber = (value, options) => (
  Number(value).toLocaleString(currentLocale(), options)
);

/**
 * Locale-aware date/time. `value` is anything `new Date()` accepts; invalid
 * input yields null so the caller decides what placeholder to show.
 */
export const formatDateTime = (value, options = { dateStyle: 'medium', timeStyle: 'short' }) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(currentLocale(), options).format(date);
};

// The numeric components below are what toLocaleDateString()/toLocaleTimeString()
// use when given no options, so existing screens render the same text.
export const formatDate = (value) => (
  formatDateTime(value, { year: 'numeric', month: 'numeric', day: 'numeric' })
);

export const formatTime = (value) => (
  formatDateTime(value, { hour: 'numeric', minute: 'numeric', second: 'numeric' })
);
