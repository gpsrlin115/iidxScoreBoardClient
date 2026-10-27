import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n/index.js';
import {
  BASE_LANGUAGE,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
} from '../../i18n/languages.js';

/**
 * Language picker shared by the app shell and the signed-out screens. Option
 * labels are each language's own name so the control is findable whichever
 * language is currently showing.
 */
const LanguageSelect = ({ className }) => {
  const { t, i18n } = useTranslation();
  const current = normalizeLanguage(i18n.language) ?? BASE_LANGUAGE;

  return (
    <label className={clsx('inline-flex items-center', className)}>
      <span className="sr-only">{t('common.language.label')}</span>
      <select
        value={current}
        onChange={(event) => setLanguage(event.target.value)}
        className={clsx(
          'min-h-6 max-w-full cursor-pointer rounded-[3px] border border-line bg-transparent',
          'px-[6px] py-[2px] font-sans text-[11px] normal-case tracking-normal text-muted',
          'hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
        )}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language} className="bg-night text-ink">
            {LANGUAGE_LABELS[language]}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSelect;
