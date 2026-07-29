const UNCATEGORIZED_TIER_LABEL = '未定';

const CATEGORY_LABELS = {
  지력: '地力',
  개인차: '個人差',
};

export const normalizeTierCategory = (category) => CATEGORY_LABELS[category] ?? category ?? null;

const normalizeTierItem = (item) => {
  if (typeof item === 'string') {
    return {
      title: item,
      difficulty: null,
      category: null,
      tier: null,
      sortOrder: null,
    };
  }

  return {
    title: item.title,
    difficulty: item.difficulty ?? item.chartType ?? null,
    category: normalizeTierCategory(item.category),
    tier: item.tier ?? null,
    sortOrder: item.sortOrder ?? null,
  };
};

const buildTierLabel = (item, fallbackLabel) => {
  if (item.category && item.tier) return `${item.category} ${item.tier}`;
  if (item.tier) return item.tier;
  return fallbackLabel;
};

export const groupTierItems = (items, fallbackLabel = UNCATEGORIZED_TIER_LABEL) => {
  const grouped = {};

  items.forEach((item) => {
    const normalized = normalizeTierItem(item);
    if (!normalized.title) return;

    const tierLabel = buildTierLabel(normalized, fallbackLabel);
    if (!grouped[tierLabel]) grouped[tierLabel] = [];
    grouped[tierLabel].push(normalized);
  });

  return grouped;
};

export const normalizeTitleKey = (title) => String(title ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\s/g, '');

export const normalizeDifficultyKey = (difficulty) => String(difficulty ?? '')
  .trim()
  .toUpperCase();
