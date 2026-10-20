export const ENABLE_LAYOUT_ANALYSIS = import.meta.env.VITE_ENABLE_LAYOUT_ANALYSIS === '1';
export const ENABLE_NOTE_RADAR = import.meta.env.VITE_ENABLE_NOTE_RADAR === '1';

/**
 * Server rival collection (IIDX code link + SP·DP collection) is built in but stays
 * hidden until the server opens it. With the flag off nothing of it mounts: the
 * import card and its polling, the profile's IIDX code section, and the
 * /crawler/iidx-link popup route. Production builds pass '0' until launch.
 */
export const isRivalCollectionEnabled = (env = import.meta.env) => env?.VITE_ENABLE_RIVAL_COLLECTION === '1';

export const ENABLE_RIVAL_COLLECTION = isRivalCollectionEnabled();
