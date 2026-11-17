import { CLEAR_TYPE_LABELS, normalizeClearType } from '../../../utils/clearTypes';
import { formatDateTime as formatLocaleDateTime, formatNumber as formatLocaleNumber } from '../../../i18n/format.js';

export const formatNumber = (value) => (
  Number.isFinite(value) ? formatLocaleNumber(value) : '-'
);

export const formatDateTime = (value) => (
  value ? (formatLocaleDateTime(value) ?? '-') : '-'
);

export const formatClearType = (value) => {
  const normalized = normalizeClearType(value);
  return normalized ? (CLEAR_TYPE_LABELS[normalized] ?? normalized) : '-';
};
