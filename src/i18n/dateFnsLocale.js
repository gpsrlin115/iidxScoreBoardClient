import { enUS } from 'date-fns/locale/en-US';
import { ja } from 'date-fns/locale/ja';
import { ko } from 'date-fns/locale/ko';
import i18n from './index.js';
import { normalizeLanguage } from './languages.js';

const DATE_FNS_LOCALES = { ko, ja, en: enUS };

/** date-fns locale object for the active UI language. */
export const dateFnsLocale = () => (
  DATE_FNS_LOCALES[normalizeLanguage(i18n.language) ?? 'ko']
);
