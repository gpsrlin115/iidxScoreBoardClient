import { CLEAR_TYPE_LABELS, normalizeClearType } from '../../../utils/clearTypes';

export const formatNumber = (value) => (
  Number.isFinite(value) ? value.toLocaleString('ko-KR') : '-'
);

export const formatDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const formatClearType = (value) => {
  const normalized = normalizeClearType(value);
  return normalized ? (CLEAR_TYPE_LABELS[normalized] ?? normalized) : '-';
};
