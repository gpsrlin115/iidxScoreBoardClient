/**
 * True only in a real browser. The language is detected for people, and only a
 * browser has one to detect. The node:test suite runs components under jsdom,
 * which reports navigator.language as en-US and would flip every Korean
 * assertion, and some tests stub just `document.cookie`. Plain Node, those
 * stubs and jsdom all count as "no browser" and keep the base language.
 */
export function isRealBrowser() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!document.documentElement) return false;
  // Read the user agent from the window: under jsdom the global `navigator` is
  // still Node's, and only window.navigator says "jsdom".
  const userAgent = window.navigator?.userAgent ?? '';
  return !/\bjsdom\b/i.test(userAgent);
}
