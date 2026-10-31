import axios from 'axios';

const BASE_URL = '/api';
const MARKER = 'x-score-browser-mock';
const MESSAGES = Object.freeze({
  SCORE_BROWSER_MOCK_UNAVAILABLE: '모의 서버에 연결할 수 없습니다. 로컬 모의 서버와 실행 설정을 확인해 주세요.',
  SCORE_BROWSER_MOCK_INVALID_RESPONSE: '모의 서버로 확인되지 않은 응답을 차단했습니다. 로컬 모의 서버와 실행 설정을 확인해 주세요.',
});

class ScoreBrowserMockError extends Error {
  constructor(code) {
    super(MESSAGES[code]);
    this.name = 'ScoreBrowserMockError';
    this.code = code;
    this.appError = { status: null, code, message: this.message, serverMessage: null, retryable: true, raw: null };
  }
}

export function isScoreBrowserMockError(error) {
  return error instanceof ScoreBrowserMockError;
}

export function scoreBrowserMockEnabled(env) {
  // Vite serve can expose DEV=false when NODE_ENV=production; the mock flag still isolates requests.
  return env?.VITE_SCORE_BROWSER_MOCK === '1';
}

export function scoreBrowserApiBaseURL(env) {
  return scoreBrowserMockEnabled(env) ? BASE_URL : env?.VITE_API_BASE_URL || 'http://localhost:8080/api';
}

function apiPath(pathname) {
  return pathname === BASE_URL || pathname.startsWith(`${BASE_URL}/`);
}

export function guardScoreBrowserMockRequest(config, origin) {
  try {
    // A caller cannot replace the forced proxy base with an environment or per-request host.
    if (config.baseURL !== BASE_URL || !origin || String(config.url ?? '').includes('\\')
      || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(String(config.url ?? ''))) throw new Error();
    const base = new URL(origin);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error();
    const target = new URL(axios.getUri(config), base.origin);
    if (target.origin !== base.origin || !apiPath(target.pathname) || target.username || target.password) throw new Error();
    // Reject encoded separators before a proxy can decode them into a different route.
    let decodedPath = target.pathname;
    for (let pass = 0; pass < 3; pass++) {
      if (/%(?:2f|5c)/i.test(decodedPath)) throw new Error();
      const next = decodeURIComponent(decodedPath);
      if (next === decodedPath) break;
      decodedPath = next;
    }
    if (!apiPath(new URL(decodedPath, base.origin).pathname)) throw new Error();
    return config;
  } catch {
    throw new ScoreBrowserMockError('SCORE_BROWSER_MOCK_UNAVAILABLE');
  }
}

function hasMockMarker(response) {
  try {
    const headers = response?.headers;
    if (!headers) return false;
    const value = typeof headers.get === 'function' ? headers.get(MARKER)
      : Object.entries(headers).find(([name]) => name.toLowerCase() === MARKER)?.[1];
    return value === '1';
  } catch {
    return false;
  }
}

export function requireScoreBrowserMockResponse(response) {
  if (!hasMockMarker(response)) throw new ScoreBrowserMockError('SCORE_BROWSER_MOCK_INVALID_RESPONSE');
  return response;
}

export function scoreBrowserMockError(error) {
  if (isScoreBrowserMockError(error)) return error;
  if (!error?.response) return new ScoreBrowserMockError('SCORE_BROWSER_MOCK_UNAVAILABLE');
  try {
    requireScoreBrowserMockResponse(error.response);
    return error;
  } catch (safeError) {
    return safeError;
  }
}
