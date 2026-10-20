export const EAGATE_ORIGIN = 'https://p.eagate.573.jp';
export const RADAR_URL = `${EAGATE_ORIGIN}/game/2dx/34/djdata/music/notesradar.html`;
export const PROFILE_URL = `${EAGATE_ORIGIN}/game/2dx/34/djdata/status.html`;
export const IMPORT_PATH = '/note-radar/import';
export const CATEGORIES = Object.freeze(['NOTES', 'CHORD', 'PEAK', 'CHARGE', 'SCRATCH', 'SOFLAN']);
export const ATTEMPT_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHARTS = new Set(['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA']);

function exact(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.keys(value).length === names.length && names.every((key) => Object.hasOwn(value, key));
}

const radarValue = (value) => Number.isFinite(value) && value >= 0 && value <= 200
  && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
const hasControlCharacter = (value) => [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export function readRadarPayload(value) {
  if (!exact(value, ['release', 'playStyle', 'iidxId', 'categories'])) return null;
  if (value.release !== '34' || value.playStyle !== 'SP' || typeof value.iidxId !== 'string'
    || !/^\d{4}-\d{4}$/.test(value.iidxId)) return null;
  if (!Array.isArray(value.categories) || value.categories.length !== 6) return null;
  const seen = new Set();
  for (const item of value.categories) {
    if (!exact(item, ['category', 'value', 'entries']) || !CATEGORIES.includes(item.category)
      || seen.has(item.category) || !radarValue(item.value)) return null;
    seen.add(item.category);
    if (!Array.isArray(item.entries) || item.entries.length > 10) return null;
    const chartKeys = new Set();
    for (const entry of item.entries) {
      if (!exact(entry, ['externalId', 'title', 'chartType', 'value']) || entry.externalId !== null
        || typeof entry.title !== 'string' || entry.title.length < 1 || entry.title.length > 512
        || entry.title.trim() !== entry.title || hasControlCharacter(entry.title)
        || !CHARTS.has(entry.chartType) || !radarValue(entry.value)) return null;
      const chartKey = JSON.stringify([entry.title, entry.chartType]);
      if (chartKeys.has(chartKey)) return null;
      chartKeys.add(chartKey);
    }
  }
  return value;
}

export function readRadarMessage(value, attemptId) {
  if (!exact(value, ['type', 'version', 'attemptId', 'payload'])
    || value.type !== 'IIDX_RADAR_DATA' || value.version !== 1
    || typeof value.attemptId !== 'string' || !ATTEMPT_FORMAT.test(value.attemptId) || value.attemptId !== attemptId) return null;
  return readRadarPayload(value.payload);
}

export function readReadyMessage(value) {
  if (!exact(value, ['type', 'version', 'attemptId']) || value.type !== 'IIDX_RADAR_READY'
    || value.version !== 1 || typeof value.attemptId !== 'string' || !ATTEMPT_FORMAT.test(value.attemptId)) return null;
  return value.attemptId;
}
