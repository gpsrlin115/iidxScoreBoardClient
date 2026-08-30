import {
  groupTierItems,
  normalizeDifficultyKey,
  normalizeTitleKey,
  sortTierRows,
} from './tierData.js';
import { isClearTypeCleared } from './clearTypes.js';

export const DEFAULT_SHARE_SCOPE = Object.freeze({
  level: 12,
  playStyle: 'SP',
  mode: 'chips',
});

const LEVELS = new Set([10, 11, 12]);
const PLAY_STYLES = new Set(['SP', 'DP']);
const MODES = new Set(['chips', 'dense']);

export const normalizeShareScope = (input = {}) => {
  const parsedLevel = Number(input.level);
  const playStyle = String(input.playStyle ?? '').toUpperCase();
  const mode = String(input.mode ?? '').toLowerCase();

  return {
    level: LEVELS.has(parsedLevel) ? parsedLevel : DEFAULT_SHARE_SCOPE.level,
    playStyle: PLAY_STYLES.has(playStyle) ? playStyle : DEFAULT_SHARE_SCOPE.playStyle,
    mode: MODES.has(mode) ? mode : DEFAULT_SHARE_SCOPE.mode,
  };
};

export const scopeFromSearchParams = (searchParams) => normalizeShareScope({
  level: searchParams.get('level'),
  playStyle: searchParams.get('playStyle'),
  mode: searchParams.get('mode'),
});

export const scopeToSearchParams = ({ level, playStyle, mode }) => new URLSearchParams({
  level: String(level),
  playStyle,
  mode,
});

export const buildTierShareUrl = (origin, shareId, scope) => {
  const normalized = normalizeShareScope(scope);
  const base = String(origin).replace(/\/$/, '');
  return `${base}/shared/tier-table/${encodeURIComponent(shareId)}?${scopeToSearchParams(normalized)}`;
};

const tierItemKey = (title, difficulty) => (
  JSON.stringify([normalizeTitleKey(title), normalizeDifficultyKey(difficulty)])
);

export const publicTierItemsToRows = (items = []) => {
  const clearTypeByKey = new Map(
    items.map((item) => [tierItemKey(item.title, item.difficulty), item.clearType])
  );
  const grouped = groupTierItems(items);
  const rows = Object.entries(grouped).map(([tier, songs]) => ({
    tier,
    songs: songs.map((song) => ({
      ...song,
      clearType: clearTypeByKey.get(tierItemKey(song.title, song.difficulty)) ?? 'NO_PLAY',
    })),
  }));
  return sortTierRows(rows);
};

export const calculateTierProgress = (tiers = []) => {
  const total = tiers.reduce((sum, tier) => sum + tier.songs.length, 0);
  const cleared = tiers.reduce(
    (sum, tier) => sum + tier.songs.filter((song) => isClearTypeCleared(song.clearType)).length,
    0
  );
  return {
    cleared,
    total,
    percent: total > 0 ? Math.round((cleared / total) * 100) : 0,
  };
};

export const sanitizeFilenamePart = (value) => Array.from(String(value ?? 'user').normalize('NFKC'))
  .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
  .join('')
  .replace(/[<>:"/\\|?*]/g, '-')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^[-.]+|[-.]+$/g, '')
  .slice(0, 50) || 'user';

const pad2 = (value) => String(value).padStart(2, '0');

export const buildTierImageFilename = (username, scope, date = new Date()) => {
  const { level, playStyle, mode } = normalizeShareScope(scope);
  const timestamp = [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    '-',
    pad2(date.getHours()),
    pad2(date.getMinutes()),
  ].join('');

  return `iidx-tier-${sanitizeFilenamePart(username)}-${playStyle}-lv${level}-${mode}-${timestamp}.png`;
};

export const createLatestRequestGuard = () => {
  let latestId = 0;
  return {
    next: () => ++latestId,
    isCurrent: (requestId) => requestId === latestId,
    invalidate: () => {
      latestId += 1;
    },
  };
};
