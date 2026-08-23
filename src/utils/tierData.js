export const UNCATEGORIZED_TIER_LABEL = '未定';

const CATEGORY_LABELS = {
  지력: '地力',
  개인차: '個人差',
};

// Canonical row order, shared by the admin editor and the public viewer. It
// lives in this import-free module rather than in adminTierStore so the
// viewer can reach it: AdminTierTable is lazy()-loaded into its own chunk
// (App.jsx), and importing the admin store from tierStore would drag that
// chunk into the main bundle.
export const TIERS = ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F'];
export const CATEGORIES = ['地力', '個人差'];

// Items that reach the viewer without a category are 地力, matching what the
// admin editor already assumes (adminTierLoader's DEFAULT_CATEGORY). Without
// this the same chart reads as '地力 F' in the editor and a bare 'F' in the
// viewer -- and a payload that fills the category on only some items splits
// one tier into two separate rows.
export const DEFAULT_CATEGORY = '地力';

export const normalizeTierCategory = (category) => CATEGORY_LABELS[category] ?? category ?? null;

// This is a field whitelist: anything not listed here is dropped before the
// viewer ever sees it. `chartId` is the only stable identity a tier item has
// (title + difficulty are matched loosely and can be re-spelled), so per-chart
// features such as tier voting break silently if it stops being carried here.
// It stays null for legacy payloads and for items the backend could not
// resolve to a chart.
const normalizeTierItem = (item) => {
  if (typeof item === 'string') {
    return {
      title: item,
      difficulty: null,
      category: null,
      tier: null,
      sortOrder: null,
      chartId: null,
    };
  }

  return {
    title: item.title,
    difficulty: item.difficulty ?? item.chartType ?? null,
    category: normalizeTierCategory(item.category) ?? DEFAULT_CATEGORY,
    tier: item.tier ?? null,
    sortOrder: item.sortOrder ?? null,
    chartId: item.chartId ?? null,
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

// Tier-major, category-minor: 地力 S+, 個人差 S+, 地力 S, ... This mirrors the
// admin editor's buildSectionKeys(); only the separator differs, since the
// editor keys sections with '|' and the viewer labels them with a space.
const TIER_LABEL_RANK = new Map(
  TIERS.flatMap((tier) => CATEGORIES.map((category) => `${category} ${tier}`))
    .map((label, index) => [label, index])
);

// Ranks past every known label, so unrecognised tiers land between the real
// rows and 未定 instead of scattering back into backend order.
const UNKNOWN_TIER_RANK = TIER_LABEL_RANK.size;
const UNCATEGORIZED_TIER_RANK = UNKNOWN_TIER_RANK + 1;

const tierLabelRank = (label) => {
  if (label === UNCATEGORIZED_TIER_LABEL) return UNCATEGORIZED_TIER_RANK;

  const known = TIER_LABEL_RANK.get(label);
  if (known !== undefined) return known;

  // Legacy grouped payloads (api/tiers.js returns those untouched) key rows by
  // a bare tier with no category prefix. Rank them where DEFAULT_CATEGORY says
  // they belong rather than dumping them in the unknown bucket.
  if (TIERS.includes(label)) {
    return TIER_LABEL_RANK.get(`${DEFAULT_CATEGORY} ${label}`);
  }

  return UNKNOWN_TIER_RANK;
};

export const compareTierLabels = (a, b) => {
  const byRank = tierLabelRank(a) - tierLabelRank(b);
  if (byRank !== 0) return byRank;
  // Same rank means both are unrecognised: order them alphabetically so the
  // rows at least stay put between renders.
  return titleCollator.compare(a ?? '', b ?? '');
};

/**
 * Order tier rows for display.
 *
 * The viewer had no ordering at all: rows rendered in whatever sequence the
 * backend array happened to produce, which put 未定 on top and scrambled the
 * grades. Sorting here — on the array, not on object key insertion order —
 * fixes both the tier table and the dashboard progress list, since they read
 * the same enrichedTierData.
 *
 * @param {Array<{tier: string}>} rows
 */
export const sortTierRows = (rows) => (
  [...rows].sort((a, b) => compareTierLabels(a?.tier, b?.tier))
);

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
