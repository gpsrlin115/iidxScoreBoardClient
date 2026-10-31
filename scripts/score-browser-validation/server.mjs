// Explicit local development server. Run: node scripts/score-browser-validation/server.mjs --port 18086
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { SCORES, USER, queryScores, seriesFor, tierItems, currentTier } from './fixtures.mjs';

export const SCORE_BROWSER_MOCK_PORT = 18086;
export const SCORE_BROWSER_MOCK_IDENTITY = Object.freeze({ service: 'iidx-score-browser-mock', version: 1 });
const TOKEN = 'synthetic-score-browser-xsrf';
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Score-Browser-Mock': '1', ...headers });
  res.end(status === 204 ? undefined : JSON.stringify(body));
};
const failure = (res, status, message) => json(res, status, { code: 'SCORE_BROWSER_MOCK', message });
const seedComment = (chartId) => ({ id: Number(chartId) * 100, userId: 999, username: 'MOCK_COMMENT',
  avatarUrl: null, body: `MOCK 채보 ${chartId}의 댓글입니다.`, createdAt: '2026-10-23T00:00:00Z',
  authorVote: null, authorVoteStale: false, deletable: false });
const voteState = (value = null) => ({ counts: { UP: value === 'UP' ? 1 : 0,
  KEEP: value === 'KEEP' ? 1 : 0, DOWN: value === 'DOWN' ? 1 : 0 }, total: value ? 1 : 0,
  myVote: value, myVoteStale: false });

export function createScoreBrowserMockServer() {
  const state = { requests: [], delays: {}, failNextPage: null, failTiers: false, failSeries: false, userId: USER.id };
  const comments = new Map(), votes = new Map();
  const entries = (chartId) => {
    if (!comments.has(chartId)) comments.set(chartId, [seedComment(chartId)]);
    return comments.get(chartId);
  };
  return createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return failure(res, 403, 'Local development only');
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Expose-Headers', 'X-Score-Browser-Mock');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') return json(res, 204, null, {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-XSRF-TOKEN,X-CSRF-TOKEN',
      });
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/__mock/identity') return json(res, 200, SCORE_BROWSER_MOCK_IDENTITY);
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 65536) return failure(res, 413, 'Request too large'); }
      const input = raw.trim() ? JSON.parse(raw) : {};
      if (url.pathname === '/__mock/state') return json(res, 200, { ...state, rowCount: SCORES.length, mock: true });
      if (url.pathname === '/__mock/control' && req.method === 'POST') {
        if (input.reset) { state.requests = []; state.delays = {}; state.failNextPage = null; state.failTiers = false; state.failSeries = false; }
        for (const key of ['delays', 'failNextPage', 'failTiers', 'failSeries', 'userId']) {
          if (Object.hasOwn(input, key)) state[key] = input[key];
        }
        return json(res, 200, { mock: true, ...state });
      }
      const path = url.pathname.replace(/^\/api/, '');
      const query = Object.fromEntries(url.searchParams);
      state.requests.push({ method: req.method, path: url.pathname, query });
      if (state.requests.length > 3000) state.requests.shift();
      const delay = Math.min(5000, Math.max(0, Number(state.delays[query.q] ?? state.delays[url.pathname]) || 0));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (path === '/users/me' || path === '/auth/me' || path === '/auth/login') return json(res, 200,
        { ...USER, id: state.userId }, { 'Set-Cookie': `XSRF-TOKEN=${TOKEN}; Path=/; SameSite=Lax` });
      if (path === '/auth/logout') return json(res, 204);
      if (path === '/auth/providers') return json(res, 200, { google: { enabled: false, enrollmentEnabled: false } });
      if (path === '/users/me/login-methods') return json(res, 200, { passwordEnabled: true, googleLinked: false });
      if (path === '/crawler/iidx/me') return json(res, 200, { iidxId: null, registered: false, verified: false, state: 'UNLINKED' });
      if (path === '/crawler/rival/jobs/me') return json(res, 200, { enabled: false, latestJob: null, cooldownUntil: null });
      if (path === '/tier-shares/me') return json(res, 200, { enabled: false, shareId: null });
      if (path === '/scores/series' && req.method === 'GET') return state.failSeries
        ? failure(res, 503, 'MOCK series failure') : json(res, 200, seriesFor(query.playStyle || 'SP'));
      if (path === '/scores' && req.method === 'GET') {
        if (state.failNextPage !== null && Number(query.page || 0) === Number(state.failNextPage)) {
          state.failNextPage = null; return failure(res, 503, 'MOCK page failure, retry allowed');
        }
        return json(res, 200, queryScores(url.searchParams));
      }
      const tiers = path.match(/^\/tiers\/(\d+)\/(SP|DP)$/);
      if (tiers) return state.failTiers ? failure(res, 503, 'MOCK tier failure') : json(res, 200, tierItems(tiers[1], tiers[2]));
      const chart = path.match(/^\/charts\/(\d+)\/(feedback|comments|vote)(?:\/(\d+))?$/);
      if (chart) {
        const [, chartId, action, commentId] = chart;
        if (!SCORES.some((row) => String(row.chart.id) === chartId)) return failure(res, 404, 'Unknown mock chart');
        if (action === 'feedback' && req.method === 'GET') return json(res, 200, {
          chartId: Number(chartId), currentTier: currentTier(chartId),
          vote: voteState(votes.get(chartId)), commentCount: entries(chartId).length,
        });
        if (action === 'vote') {
          if (!currentTier(chartId)) return failure(res, 409, 'Tier unassigned');
          if (req.method === 'PUT') votes.set(chartId, input.value);
          if (req.method === 'DELETE') votes.delete(chartId);
          return json(res, 200, voteState(votes.get(chartId)));
        }
        if (action === 'comments' && req.method === 'GET') {
          const rows = entries(chartId), page = Number(query.page || 0), size = Number(query.size || 20);
          return json(res, 200, { content: rows.slice(page * size, (page + 1) * size),
            number: page, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size) });
        }
        if (action === 'comments' && req.method === 'POST') {
          if (typeof input.body !== 'string' || !input.body.trim()) return failure(res, 400, 'Comment body required');
          const row = { ...seedComment(chartId), id: Date.now(), userId: state.userId,
            username: USER.username, body: input.body, deletable: true, createdAt: new Date().toISOString() };
          comments.set(chartId, [row, ...entries(chartId)]); return json(res, 201, row);
        }
        if (action === 'comments' && req.method === 'DELETE') {
          comments.set(chartId, entries(chartId).filter((row) => row.id !== Number(commentId))); return json(res, 204);
        }
      }
      return failure(res, 404, `No mock route: ${req.method} ${url.pathname}`);
    } catch (error) { return failure(res, 400, error.message); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf('--port');
  const port = index === -1 ? SCORE_BROWSER_MOCK_PORT : Number(process.argv[index + 1]);
  if (port !== SCORE_BROWSER_MOCK_PORT) throw new Error('Score browser mock uses dedicated port 18086');
  if (process.env.NODE_ENV === 'production') throw new Error('Development mock cannot run in production');
  createScoreBrowserMockServer().listen(port, '127.0.0.1', () => {
    console.log(`SCORE BROWSER MOCK ONLY: http://127.0.0.1:${port}, ${SCORES.length} synthetic records`);
  });
}
