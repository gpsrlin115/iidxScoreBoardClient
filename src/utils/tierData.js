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

// Titles mix Latin, Japanese and symbols, and admins run different browser
// locales; the collator is pinned to one locale so every editor produces the
// same order and saving never generates a spurious reordering diff.
const titleCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export const compareSongsByTitle = (a, b) => {
  const byTitle = titleCollator.compare(a?.title ?? '', b?.title ?? '');
  if (byTitle !== 0) return byTitle;
  // Same title on two charts (ANOTHER / LEGGENDARIA): keep the order stable.
  return titleCollator.compare(a?.difficulty ?? '', b?.difficulty ?? '');
};

export const sortSongsByTitle = (songs) => [...songs].sort(compareSongsByTitle);

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

  // The viewer enforces the same A-Z invariant as the editor, so a tier reads
  // alphabetically regardless of the row order the backend happens to return.
  Object.keys(grouped).forEach((tierLabel) => {
    grouped[tierLabel] = sortSongsByTitle(grouped[tierLabel]);
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
