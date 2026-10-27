import { useTranslation } from 'react-i18next';
import { currentLocale } from './format.js';

/**
 * Subscribes the calling component to language changes and returns the active
 * locale tag. Components that format dates or numbers through ./format.js
 * without translating any text call this so they re-render on a switch.
 */
export function useLocale() {
  useTranslation();
  return currentLocale();
}
