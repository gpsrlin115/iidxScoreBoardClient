// Explicit local mock only. Run: node scripts/note-radar-mock.mjs --port 8080
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { CHARTS, CATEGORIES, SCENARIOS, IIDX_ID, IMPORTED_AT, USER, initialGoals,
  summaryData, recommendationData, officialPayload, simulateData } from './note-radar-mock-data.mjs';

const TOKEN = 'synthetic-note-radar-xsrf';
const cookies = (req) => Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).filter(Boolean)
  .map((part) => { const i = part.indexOf('='); return [part.slice(0, i), part.slice(i + 1)]; }));
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Note-Radar-Mock': '1', ...headers });
  res.end(status === 204 ? undefined : JSON.stringify(body));
};
const failure = (res, status, code, message) => json(res, status, { code, message });
const invalid = (res, message = '허용된 요청 형식과 숫자 EX 점수를 확인해 주세요.') => failure(res, 400, 'INVALID_RADAR_INPUT', message);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exact = (obj, names) => obj && !Array.isArray(obj) && typeof obj === 'object'
  && Object.keys(obj).length === names.length && names.every((name) => Object.hasOwn(obj, name));
const validEx = (chartId, exScore) => Number.isSafeInteger(chartId) && Number.isSafeInteger(exScore)
  && exScore >= 0 && CHARTS.some((chart) => chart.chartId === chartId && exScore <= chart.noteCount * 2);

function initialState(scenario) {
  return { scenario, importedAgain: scenario === 'reimport', importedAt: IMPORTED_AT,
    goals: initialGoals(), nextGoalId: 930101,
    attempt: ['pending', 'expired'].includes(scenario) ? { attemptId: randomUUID(), status: 'PENDING',
      expiresAt: new Date(Date.now() + (scenario === 'expired' ? -1000 : 300000)).toISOString() } : null,
    requests: [], delays: {} };
}

export function createNoteRadarMockServer({ scenario = 'normal', delayMs = 1400 } = {}) {
  if (!SCENARIOS.includes(scenario)) throw new Error('Unknown mock scenario');
  let state = initialState(scenario);
  const server = createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return failure(res, 403, 'MOCK_LOCAL_ONLY', '모의 서버는 localhost에서만 사용할 수 있습니다.');
      }
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Expose-Headers', 'X-Note-Radar-Mock');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') return json(res, 204, null, {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-XSRF-TOKEN,X-CSRF-TOKEN',
      });
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = [];
      let length = 0;
      for await (const part of req) {
        length += part.length;
        if (length > 65536) return invalid(res, '요청이 너무 큽니다.');
        parts.push(part);
      }
      const raw = Buffer.concat(parts).toString('utf8');
      let input;
      if (raw.trim()) {
        try { input = JSON.parse(raw); } catch { return invalid(res, 'JSON 형식을 확인해 주세요.'); }
      }
      if (url.pathname === '/__mock/state' && req.method === 'GET') {
        return json(res, 200, { ...state, mock: true, scenarios: SCENARIOS, officialPayload: officialPayload() });
      }
      if (url.pathname === '/__mock/scenario' && req.method === 'POST') {
        if (!SCENARIOS.includes(input?.scenario)) return invalid(res, '알 수 없는 모의 상태입니다.');
        state = initialState(input.scenario);
        if (input.delays && typeof input.delays === 'object') state.delays = input.delays;
        return json(res, 200, { scenario: state.scenario, mock: true });
      }
      const path = url.pathname.replace(/^\/api/, '');
      state.requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
        bodyKeys: input && typeof input === 'object' ? Object.keys(input) : [], hasBody: raw.length > 0,
        csrf: req.headers['x-xsrf-token'] === TOKEN });
      if (state.requests.length > 300) state.requests.shift();
      if (path === '/auth/login' && req.method === 'POST') {
        if (state.scenario === 'signed-out') state.scenario = 'normal';
        return json(res, 200, USER, { 'Set-Cookie': `XSRF-TOKEN=${TOKEN}; Path=/; SameSite=Lax` });
      }
      if (path === '/auth/providers') return json(res, 200, { google: { enabled: false, enrollmentEnabled: false } });
      if (state.scenario === 'signed-out') return failure(res, 401, 'SITE_LOGIN_REQUIRED', '다시 로그인해 주세요.');
      if (path === '/users/me' && req.method === 'GET') {
        return json(res, 200, USER, { 'Set-Cookie': `XSRF-TOKEN=${TOKEN}; Path=/; SameSite=Lax` });
      }
      if (['POST', 'PUT', 'DELETE'].includes(req.method)
        && (cookies(req)['XSRF-TOKEN'] !== TOKEN || req.headers['x-xsrf-token'] !== TOKEN)) {
        return failure(res, 403, 'CSRF_INVALID', '페이지를 새로고침하고 요청 보안 토큰을 확인해 주세요.');
      }
      if (path === '/auth/logout' && req.method === 'POST') {
        state.scenario = 'signed-out'; return json(res, 204);
      }
      if (path === '/crawler/iidx/me' && req.method === 'GET') return json(res, 200, {
        iidxId: state.scenario === 'unlinked' ? null : IIDX_ID, state: state.scenario === 'unlinked' ? 'UNLINKED' : 'REGISTERED',
        registered: state.scenario !== 'unlinked', verified: false, verifiedAt: null, registeredAt: IMPORTED_AT,
      });
      if (path === '/crawler/rival/jobs/me' && req.method === 'GET') return json(res, 200, { enabled: false, latestJob: null, cooldownUntil: null });
      if (!path.startsWith('/note-radar/')) return failure(res, 404, 'MOCK_ROUTE_NOT_FOUND', '모의 응답이 없는 경로입니다.');
      if (state.scenario === 'disabled') return failure(res, 503, 'NOTE_RADAR_DISABLED', '노트레이더 기능이 아직 활성화되지 않았습니다.');
      const activeState = state;
      const delay = Math.min(5000, Math.max(0, Number(state.delays[url.pathname]) || 0));
      if (delay) await wait(delay);
      if (path === '/note-radar/me' && req.method === 'GET') return json(res, 200, summaryData(activeState));
      if (path === '/note-radar/recommendations' && req.method === 'GET') {
        const filters = Object.fromEntries(url.searchParams);
        if (!CATEGORIES.includes(filters.category) || filters.level && (!/^\d+$/.test(filters.level) || +filters.level < 1 || +filters.level > 12)
          || filters.record && !['present', 'absent'].includes(filters.record)
          || filters.goal && (!Number.isFinite(+filters.goal) || +filters.goal < 0 || +filters.goal > 200)) return invalid(res);
        if (activeState.scenario === 'slow-recommendations') await wait(delayMs);
        if (activeState.scenario === 'recommendations-failed' || activeState.scenario === 'partial-failure' && filters.category === 'CHORD') {
          return failure(res, 502, 'MOCK_RECOMMENDATIONS_UNAVAILABLE', '모의 상태: 추천 조회에 실패했습니다. 현황은 계속 사용할 수 있습니다.');
        }
        if (!summaryData(activeState).importedAt) return json(res, 200, { category: filters.category,
          recommendations: [], exploration: [], issues: ['공식 레이더를 먼저 가져와 주세요.'] });
        return json(res, 200, recommendationData(filters.category, activeState.scenario, filters));
      }
      if (path === '/note-radar/imports/current' && req.method === 'GET') {
        const attempt = activeState.attempt;
        return json(res, 200, attempt ? { ...attempt, status: attempt.status === 'PENDING' && Date.parse(attempt.expiresAt) < Date.now() ? 'EXPIRED' : attempt.status }
          : { attemptId: null, status: 'NONE', expiresAt: null });
      }
      if (path === '/note-radar/imports' && req.method === 'POST') {
        if (raw.trim()) return invalid(res, '가져오기 시작 요청에는 본문이 필요하지 않습니다.');
        if (activeState.scenario === 'unlinked') return failure(res, 409, 'IIDX_LINK_REQUIRED', '가져오기 메뉴에서 IIDX 코드를 먼저 연결해 주세요.');
        activeState.attempt = { attemptId: randomUUID(), status: 'PENDING',
          expiresAt: new Date(Date.now() + (activeState.scenario === 'expired' ? -1000 : 300000)).toISOString() };
        return json(res, 201, activeState.attempt);
      }
      if (path === '/note-radar/imports/complete' && req.method === 'POST') {
        if (!exact(input, ['attemptId', 'payload'])) return invalid(res);
        const attempt = activeState.attempt;
        if (!attempt || attempt.attemptId !== input.attemptId || attempt.status !== 'PENDING' || Date.parse(attempt.expiresAt) <= Date.now()) {
          return failure(res, 409, 'RADAR_ATTEMPT_EXPIRED', '가져오기가 만료되었거나 이미 끝났습니다. 다시 시작해 주세요.');
        }
        if (activeState.scenario === 'mismatch' || input.payload?.iidxId !== IIDX_ID) {
          return failure(res, 409, 'IIDX_ACCOUNT_MISMATCH', '연결한 IIDX 코드와 공식 페이지의 계정이 다릅니다.');
        }
        if (input.payload?.release !== '34' || input.payload?.playStyle !== 'SP' || input.payload?.categories?.length !== 6) return invalid(res);
        attempt.status = 'COMPLETED'; activeState.importedAgain = true; activeState.importedAt = new Date().toISOString();
        activeState.goals = activeState.goals.map((goal, index) => index === 0 ? { ...goal, achieved: true, status: 'ACHIEVED' } : goal);
        return json(res, 200, attempt);
      }
      if (path === '/note-radar/goals' && req.method === 'GET') {
        if (activeState.scenario === 'goals-failed') return failure(res, 502, 'MOCK_GOALS_UNAVAILABLE', '모의 상태: 목표곡 목록을 불러오지 못했습니다.');
        return json(res, 200, activeState.goals);
      }
      if (path === '/note-radar/goals' && req.method === 'PUT') {
        if (!exact(input, ['chartId', 'category', 'targetExScore']) || !CATEGORIES.includes(input.category)
          || !validEx(input.chartId, input.targetExScore)) return invalid(res);
        if (activeState.scenario === 'save-failed') return failure(res, 503, 'MOCK_SAVE_UNAVAILABLE', '모의 상태: 목표를 저장하지 못했습니다.');
        const chart = CHARTS.find((row) => row.chartId === input.chartId);
        const previous = activeState.goals.find((goal) => goal.chartId === input.chartId && goal.category === input.category);
        const goal = { ...chart, ...input, id: previous?.id ?? activeState.nextGoalId++, status: 'UNVERIFIED',
          achieved: false, updatedAt: new Date().toISOString() };
        activeState.goals = [...activeState.goals.filter((row) => row.id !== goal.id), goal];
        return json(res, 200, goal);
      }
      if (/^\/note-radar\/goals\/\d+$/.test(path) && req.method === 'DELETE') {
        const id = Number(path.split('/').at(-1));
        if (!activeState.goals.some((goal) => goal.id === id)) return failure(res, 404, 'RADAR_GOAL_NOT_FOUND', '목표곡을 찾을 수 없습니다.');
        activeState.goals = activeState.goals.filter((goal) => goal.id !== id); return json(res, 204);
      }
      if (path === '/note-radar/simulate' && req.method === 'POST') {
        if (!summaryData(activeState).importedAt) return invalid(res, '공식 레이더를 먼저 가져와 주세요.');
        if (!exact(input, ['targets']) || !Array.isArray(input.targets) || !input.targets.length || input.targets.length > 50
          || input.targets.some((target) => !exact(target, ['chartId', 'exScore']) || !validEx(target.chartId, target.exScore))) return invalid(res);
        if (activeState.scenario === 'slow-simulation') await wait(delayMs);
        return json(res, 200, simulateData(input.targets, activeState));
      }
      return failure(res, 404, 'MOCK_ROUTE_NOT_FOUND', '모의 응답이 없는 경로입니다.');
    } catch {
      if (!res.headersSent) failure(res, 500, 'MOCK_INTERNAL_ERROR', '모의 서버 요청을 처리하지 못했습니다.');
      else res.end();
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const port = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : 8080);
  const scenario = args.includes('--scenario') ? args[args.indexOf('--scenario') + 1] : 'normal';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
  createNoteRadarMockServer({ scenario }).listen(port, '127.0.0.1', () => {
    process.stdout.write(`Note radar SYNTHETIC MOCK listening on http://127.0.0.1:${port}\n`);
  });
}
