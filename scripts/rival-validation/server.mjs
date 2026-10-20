// Local rival-collection UI validation server. Never contacts eagate or a backend.
// Usage: node scripts/rival-validation/server.mjs --dist dist --port 5310
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a, []));
const DIST = resolve(args.dist ?? 'dist');
const PORT = Number(args.port ?? 5310);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('invalid --port');
const XSRF = 'local-rival-validation-token';
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };

let scenario = 'normal';
let binding = null;
let job = null;
let jobStep = 0;
let slowBindingTimer = null;
let expireNextCrawler = false;
let statusActive = 0;
let doneScore = false;
const stats = { requests: 0, routes: {}, trace: [], maxConcurrentStatus: 0 };
const resetStats = () => { stats.requests = 0; stats.routes = {}; stats.trace = []; stats.maxConcurrentStatus = 0; statusActive = 0; };
const jobData = (status, extra = {}) => ({
  id: 701, status, playStyle: 'SP', gameRelease: '34', pagesDone: null, pagesTotal: 34,
  requestsDone: null, requestsEstimated: 38, aheadCount: null, progressPercent: null,
  estimatedStartAt: null, estimatedFinishAt: null, nextRequestAt: null, waitingReason: null,
  errorMessage: null, detailCollectionStatus: null, detailStopReason: null,
  queuedAt: '2026-10-06T12:00:00', startedAt: null, finishedAt: null, ...extra,
});
const activeJob = () => job && ['QUEUED', 'RUNNING'].includes(job.status);
const statusBody = () => ({ enabled: !['disabled', 'disabled-active'].includes(scenario), latestJob: job, cooldownUntil: null });
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
const err = (res, status, code, message, headers = {}, shape = 'code') => json(res, status,
  shape === 'error' ? { error: code, message } : { code, message }, headers);
const cookieMap = (req) => Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
const readBody = async (req) => { const parts = []; for await (const part of req) parts.push(part); return Buffer.concat(parts); };

function record(req, url, body) {
  const path = url.pathname;
  const protectedWrite = req.method === 'POST' || req.method === 'DELETE';
  const cookies = cookieMap(req);
  const csrf = protectedWrite ? cookies['XSRF-TOKEN'] === XSRF && (req.headers['x-xsrf-token'] === XSRF || req.headers['x-csrf-token'] === XSRF) : null;
  let bodyKeys = [];
  let hasBody = body.length > 0;
  if (hasBody && (req.headers['content-type'] ?? '').includes('application/json')) {
    try { bodyKeys = Object.keys(JSON.parse(body.toString('utf8'))); } catch { bodyKeys = ['<invalid-json>']; }
  }
  stats.requests += 1;
  stats.routes[`${req.method} ${path}`] = (stats.routes[`${req.method} ${path}`] ?? 0) + 1;
  stats.trace.push({ method: req.method, path, csrf, bodyKeys, hasBody });
  if (stats.trace.length > 300) stats.trace.shift();
  return { csrf, cookies };
}

function csrfRequired(req, res, meta) {
  if ((req.method === 'POST' || req.method === 'DELETE') && !meta.csrf) {
    err(res, 403, 'CSRF_INVALID', '요청 보안 토큰을 확인할 수 없습니다. 페이지를 새로고침해 다시 시도해 주세요.');
    return true;
  }
  return false;
}

async function api(req, res, url, body, meta) {
  const p = url.pathname.replace(/^\/api/, '');
  const anon = meta.cookies.probeAnon === '1';
  if (req.method === 'GET' && p === '/users/me') {
    if (anon) return err(res, 401, 'UNAUTHENTICATED', 'Unauthorized');
    return json(res, 200, { id: 1, username: 'validator', email: 'validator@example.test', role: 'USER', avatarUrl: null }, { 'Set-Cookie': `XSRF-TOKEN=${XSRF}; Path=/; SameSite=Lax` });
  }
  if (req.method === 'POST' && p === '/auth/logout') return json(res, 204, null, { 'Set-Cookie': 'probeAnon=1; Path=/; SameSite=Lax' });
  if (req.method === 'POST' && p === '/auth/login') return json(res, 200,
    { id: 1, username: 'validator', email: 'validator@example.test', role: 'USER', avatarUrl: null },
    { 'Set-Cookie': 'probeAnon=; Path=/; Max-Age=0; SameSite=Lax' });
  if (req.method === 'GET' && p === '/auth/providers') return json(res, 200, { google: { enabled: false, enrollmentEnabled: false } });
  if (anon && p !== '/auth/logout') return err(res, 401, 'UNAUTHENTICATED', 'Unauthorized');
  if (csrfRequired(req, res, meta)) return;

  if (p === '/crawler/iidx/me') {
    if (req.method === 'GET') {
      if (scenario === 'expire-session') { expireNextCrawler = true; return expireSession(res); }
      return json(res, 200, binding ?? { iidxId: null, verified: false, verifiedAt: null });
    }
    if (req.method === 'POST') {
      let input = {};
      try { input = JSON.parse(body.toString('utf8') || '{}'); } catch { return err(res, 400, 'INVALID_VERIFICATION_INPUT', '세션 입력을 확인해 주세요.'); }
      if (Object.keys(input).some((k) => k !== 'eagateCookie') || typeof input.eagateCookie !== 'string' || !input.eagateCookie.trim()) return err(res, 400, 'INVALID_VERIFICATION_INPUT', '본인 세션 정보를 입력해 주세요.');
      if (scenario === 'verification-slow') {
        clearTimeout(slowBindingTimer);
        slowBindingTimer = setTimeout(() => { if (scenario === 'verification-slow' && !binding) binding = { iidxId: '1234-5678', verified: true, verifiedAt: '2026-10-06T12:00:02' }; }, 2000);
        return setTimeout(() => json(res, 200, { iidxId: '1234-5678', verified: true, verifiedAt: '2026-10-06T12:00:02' }), 2000);
      }
      if (scenario === 'verification-failed') return err(res, 502, 'EAGATE_VERIFICATION_FAILED', '본인 ID를 확인할 수 없습니다. 세션 정보를 확인한 뒤 다시 시도해 주세요.');
      if (scenario === 'rate-limit') return err(res, 429, 'VERIFICATION_RATE_LIMIT', '확인 가능 횟수를 초과했습니다.', { 'Retry-After': '3' });
      if (scenario === 'rate-limit-no-time') return err(res, 429, 'VERIFICATION_RATE_LIMIT', '확인 가능 횟수를 초과했습니다.');
      if (scenario === 'already-linked') return err(res, 409, 'IIDX_ID_ALREADY_LINKED', '이 IIDX ID는 이미 다른 계정에 연결되어 있습니다.');
      if (binding?.verified) return err(res, 409, 'IIDX_ID_ALREADY_LINKED', '이미 본인 IIDX ID가 연결되어 있습니다.');
      binding = { iidxId: '1234-5678', verified: true, verifiedAt: '2026-10-06T12:00:00' };
      return json(res, 200, binding);
    }
    if (req.method === 'DELETE') {
      clearTimeout(slowBindingTimer);
      binding = null;
      if (activeJob()) job = { ...job, status: 'CANCELLED', finishedAt: '2026-10-06T12:01:00' };
      return res.writeHead(204, { 'Cache-Control': 'no-store' }).end();
    }
  }
  if (p === '/crawler/rival/jobs/me') {
    if (expireNextCrawler || scenario === 'expire-session') { expireNextCrawler = false; return expireSession(res); }
    if (scenario === 'undeployed') return err(res, 404, 'NOT_FOUND', 'Not found', {}, 'error');
    if (req.method === 'GET') {
      statusActive += 1; stats.maxConcurrentStatus = Math.max(stats.maxConcurrentStatus, statusActive);
      try {
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
        if (job?.status === 'QUEUED' && jobStep++ >= 0) { job = { ...job, status: 'RUNNING', startedAt: '2026-10-06T12:00:10', pagesDone: 1, requestsDone: 1, progressPercent: 3 }; }
        else if (job?.status === 'RUNNING' && scenario === 'normal') {
          if (jobStep >= 3) {
            job = { ...job, status: 'DONE', pagesDone: 34, pagesTotal: 34, requestsDone: 38, requestsEstimated: 38, progressPercent: 100,
              detailCollectionStatus: 'DISABLED', detailStopReason: null, finishedAt: '2026-10-06T12:01:00' };
            doneScore = true;
          } else { jobStep += 1; job = { ...job, pagesDone: jobStep + 1, requestsDone: jobStep + 1, progressPercent: null }; }
        }
        return json(res, 200, statusBody());
      } finally { statusActive -= 1; }
    }
    if (req.method === 'POST') {
      if (body.length !== 0) return err(res, 400, 'INVALID_REQUEST', '요청 본문은 비어 있어야 합니다.');
      if (!statusBody().enabled) return err(res, 503, 'RIVAL_COLLECTION_DISABLED', '기록 수집 기능이 비활성화되어 있습니다.');
      if (scenario === 'operator-unavailable') return err(res, 503, 'OPERATOR_SESSION_UNAVAILABLE', '수집 서버가 아직 준비되지 않았습니다.');
      if (!binding?.verified) return err(res, 409, 'IIDX_ID_NOT_VERIFIED', '먼저 본인 IIDX ID를 확인해 주세요.');
      if (activeJob()) return err(res, 409, 'COLLECTION_ACTIVE', '이미 수집 작업이 진행 중입니다.');
      if (scenario === 'cancel-missing') job = jobData('RUNNING', { startedAt: '2026-10-06T12:00:10', pagesDone: 4, pagesTotal: 34, requestsDone: 5, requestsEstimated: 38, progressPercent: 12 });
      else if (scenario === 'partial') job = jobData('PARTIAL', { pagesDone: 8, pagesTotal: 34, requestsDone: 9, requestsEstimated: 38, errorMessage: '수집이 중단되었습니다.', detailCollectionStatus: 'STOPPED', detailStopReason: 'REQUEST_LIMIT' });
      else if (scenario === 'failed') job = jobData('FAILED', { errorMessage: '수집 작업에 실패했습니다.' });
      else if (scenario === 'cancelled') job = jobData('CANCELLED');
      else if (scenario === 'active') job = jobData('RUNNING', { pagesDone: 4, pagesTotal: 34, requestsDone: 5, requestsEstimated: 38, progressPercent: 12 });
      else if (scenario === 'null-progress') job = jobData('RUNNING', { waitingReason: null, nextRequestAt: null, estimatedFinishAt: null });
      else job = jobData('QUEUED', { aheadCount: 0, waitingReason: 'QUEUED' });
      jobStep = 0;
      if (job.status === 'DONE') doneScore = true;
      return json(res, 202, job);
    }
    if (req.method === 'DELETE') {
      if (scenario === 'undeployed') return err(res, 404, 'NOT_FOUND', 'Not found', {}, 'error');
      if (scenario === 'cancel-missing' && activeJob()) {
        job = { ...job, status: 'DONE', pagesDone: 34, pagesTotal: 34, requestsDone: 38, requestsEstimated: 38,
          progressPercent: 100, detailCollectionStatus: 'DISABLED', finishedAt: '2026-10-06T12:01:00' };
        doneScore = true;
        return err(res, 404, 'ACTIVE_JOB_NOT_FOUND', '활성 작업을 찾을 수 없습니다.', {}, 'error');
      }
      if (!activeJob()) return err(res, 404, 'ACTIVE_JOB_NOT_FOUND', '활성 작업을 찾을 수 없습니다.', {}, 'error');
      job = { ...job, status: 'CANCELLED', errorMessage: null, finishedAt: '2026-10-06T12:00:30' };
      return json(res, 200, job);
    }
  }
  if (req.method === 'GET' && p === '/scores') {
    const row = { id: 501, song: { id: 501, version: 'IIDX 34', title: '내 기록 수집 검증곡', artist: 'validator', genre: 'TEST' },
      chart: { id: 1501, playStyle: 'SP', chartType: 'ANOTHER', level: 12 }, bestScore: doneScore ? 2200 : 2000,
      bestPGreat: doneScore ? 1000 : 900, bestGreat: 100, bestMissCount: 7, bestClearType: 'HARD_CLEAR', bestDjLevel: 'AA',
      bestPlayedAt: '2026-10-06T12:00:00', lastScore: 1900, lastPGreat: 850, lastGreat: 120, lastMissCount: null,
      lastClearType: 'CLEAR', lastDjLevel: 'AA', lastPlayedAt: '2026-10-01T12:00:00', playCount: 5, songPlayCount: 5 };
    return json(res, 200, { content: [row], totalElements: 1, totalPages: 1, number: 0, size: 20 });
  }
  const tierMatch = p.match(/^\/tiers\/(\d+)\/SP$/);
  if (req.method === 'GET' && tierMatch) return json(res, 200, [
    { title: '내 기록 수집 검증곡', difficulty: 'ANOTHER', category: '地力', tier: 'A', sortOrder: 0 },
  ]);
  return err(res, 404, 'NOT_FOUND', 'Not found', {}, 'error');
}
function expireSession(res) { return err(res, 401, 'UNAUTHENTICATED', 'Unauthorized'); }

async function handler(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const body = await readBody(req);
  if (url.pathname === '/__mock' && req.method === 'GET') return json(res, 200, { scenario, stats: { ...stats, routes: { ...stats.routes }, trace: [...stats.trace] }, binding: binding ? { ...binding } : null, job: job ? { ...job } : null });
  if (url.pathname === '/__mock' && req.method === 'POST') {
    let payload = {};
    try { payload = JSON.parse(body.toString('utf8') || '{}'); } catch { return err(res, 400, 'INVALID_REQUEST', 'JSON required'); }
    const allowed = new Set(['normal', 'verification-failed', 'rate-limit', 'rate-limit-no-time', 'already-linked', 'disabled', 'disabled-active', 'undeployed', 'operator-unavailable', 'partial', 'failed', 'cancelled', 'active', 'null-progress', 'verification-slow', 'expire-session', 'cancel-missing']);
    if (!allowed.has(payload.scenario)) return err(res, 400, 'UNKNOWN_SCENARIO', 'Unknown scenario');
    clearTimeout(slowBindingTimer); scenario = payload.scenario; binding = null; job = null; jobStep = 0; doneScore = false; expireNextCrawler = false; resetStats();
    if (['active', 'null-progress', 'disabled-active'].includes(scenario)) {
      binding = { iidxId: '1234-5678', verified: true, verifiedAt: '2026-10-06T11:00:00' };
      job = jobData('RUNNING', { startedAt: '2026-10-06T11:00:10', pagesDone: scenario === 'active' ? 4 : null,
        pagesTotal: scenario === 'active' ? 34 : null, requestsDone: scenario === 'active' ? 5 : null,
        requestsEstimated: scenario === 'active' ? 38 : null, progressPercent: scenario === 'active' ? 12 : null,
        nextRequestAt: null, estimatedFinishAt: null, waitingReason: null });
    }
    return json(res, 200, { scenario }, { 'Set-Cookie': 'probeAnon=; Path=/; Max-Age=0; SameSite=Lax' });
  }
  const meta = record(req, url, body);
  if (url.pathname.startsWith('/api/')) return api(req, res, url, body, meta);

  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { return err(res, 400, 'BAD_PATH', 'Bad path'); }
  const file = resolve(DIST, `.${decoded}`);
  if (file.startsWith(`${DIST}${sep}`) && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    return res.end(readFileSync(file));
  }
  const index = join(DIST, 'index.html');
  if (!existsSync(index)) return err(res, 500, 'DIST_MISSING', `Build output not found: ${DIST}`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  return res.end(readFileSync(index));
}

createServer((req, res) => handler(req, res).catch(() => { if (!res.headersSent) err(res, 500, 'MOCK_ERROR', 'Local mock server error'); else res.destroy(); }))
  .listen(PORT, '127.0.0.1', () => console.log(`rival mock ready at http://127.0.0.1:${PORT} (dist=${DIST})`));
