// Release-validation harness: serves a built dist/ with an injected probe script
// and answers /api with fake responses shaped like server main (old) or dev (new).
// Usage: node server.mjs --dist <dir> --port <n> --mode old|new --log <file> [--perf 1]
//
// --perf 1 is for Lighthouse runs (scripts/perf-lighthouse.mjs): no probe is
// injected, and static files get the production Caddyfile's cache headers and
// gzip instead of no-store, so timings are not skewed by the harness itself.
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync, statSync, appendFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => (cur.startsWith('--') ? [...acc, [cur.slice(2), arr[i + 1]]] : acc), [])
);
const DIST = args.dist;
const PORT = Number(args.port);
const MODE = args.mode; // 'old' | 'new'
const LOG = args.log;
const PERF = args.perf === '1';
const HERE = dirname(fileURLToPath(import.meta.url));
if (!DIST || !PORT || !['old', 'new'].includes(MODE)) throw new Error('bad args');

const log = (line) => { if (LOG) appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`); };
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };

// ---------- fixtures ----------
const TIERS = ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D'];
const CLEAR = ['FULL_COMBO', 'EX_HARD_CLEAR', 'HARD_CLEAR', 'CLEAR', 'EASY_CLEAR', 'ASSIST_CLEAR', 'FAILED'];
const tierItems = [];
TIERS.forEach((tier, t) => {
  for (let i = 0; i < 12 + t * 3; i += 1) {
    tierItems.push({ title: `검증곡 ${tier}-${i + 1}`, difficulty: i % 5 === 0 ? 'LEGGENDARIA' : 'ANOTHER',
      category: '地力', tier, sortOrder: i });
  }
});

// Play-count cases (new server). Each maps to a rule in src/utils/playCount.js.
const PLAY_CASES = [
  { key: 'exact', title: 'PC 정확', playCount: 9, songPlayCount: 9, playCountRelease: '34', releasePlayCount: 9, releasePlayCountExact: true },
  { key: 'lower', title: 'PC 하한 선곡있음', playCount: 3, songPlayCount: 7, playCountRelease: '34', releasePlayCount: 3, releasePlayCountExact: false },
  { key: 'crawler', title: 'PC 하한 선곡null', playCount: 6, songPlayCount: null, playCountRelease: '34', releasePlayCount: 6, releasePlayCountExact: false },
  { key: 'stale', title: 'PC 선곡<채보', playCount: 8, songPlayCount: 5, playCountRelease: '34', releasePlayCount: 8, releasePlayCountExact: false },
  { key: 'inherited', title: 'PC 작품null', playCount: 4, songPlayCount: null, playCountRelease: null, releasePlayCount: null, releasePlayCountExact: false },
  { key: 'cumulative', title: 'PC 누적다름', playCount: 14, songPlayCount: 2, playCountRelease: '34', releasePlayCount: 2, releasePlayCountExact: true },
];

let id = 0;
const scoreRow = (title, difficulty, clearType, extra = {}) => {
  id += 1;
  const row = {
    id, song: { id, version: 'IIDX 34', title, artist: 'validator', genre: 'TEST' },
    chart: { id: 1000 + id, playStyle: 'SP', chartType: difficulty, level: 12 },
    bestScore: 2000 + id, bestPGreat: 900, bestGreat: 200 + id, bestMissCount: id % 9, bestClearType: clearType,
    bestDjLevel: 'AA', bestPlayedAt: '2026-09-20T12:00:00',
    lastScore: 1900 + id, lastPGreat: 850, lastGreat: 200, lastMissCount: 3, lastClearType: clearType,
    lastDjLevel: 'AA', lastPlayedAt: '2026-09-28T12:00:00',
    playCount: 5, songPlayCount: 5,
    playCountRelease: '34', releasePlayCount: 5, releasePlayCountExact: true,
    ...extra,
  };
  return row;
};
const scores = [
  // High EX scores so the cases sort onto the first page of /scores.
  ...PLAY_CASES.map(({ key, title, ...pc }, i) => scoreRow(title, 'ANOTHER', 'HARD_CLEAR', { ...pc, bestScore: 3100 - i })),
  ...tierItems.filter((_, i) => i % 3 !== 2).map((it, i) => scoreRow(it.title, it.difficulty, CLEAR[i % CLEAR.length])),
];
const NEW_ONLY = ['playCountRelease', 'releasePlayCount', 'releasePlayCountExact'];
const forMode = (row) => {
  if (MODE === 'new') return row;
  const copy = { ...row };
  NEW_ONLY.forEach((k) => delete copy[k]);
  return copy;
};

// Bootstrap responses. Old server: no failures key, one transaction.
const failuresNew = [
  { row: 3, title: 'ZENITH', code: 'SONG_TITLE_CASE_CONFLICT', message: 'Song title conflicts with an existing song by case: Zenith' },
  { row: 5, title: 'MOONRISE', code: 'INVALID_ROW', message: 'title, playStyle, chartType, level are required' },
  { row: 8, title: 'BROKEN', code: 'UNEXPECTED_ERROR' },
  { row: 11, code: 'INVALID_ROW', message: 'row must not be null' },
  { row: 13, title: 'LAMP', code: 'INVALID_ROW', message: 'Invalid chartType: XYZ' },
  { row: 21, title: 'SIX', code: 'INVALID_ROW', message: 'sixth' },
  { row: 34, title: 'SEVEN', code: 'UNEXPECTED_ERROR' },
];
const bootstrap = (scenario) => {
  const base = { processedCount: 120, songsImported: 10, songsUpdated: 3, chartsImported: 40, chartsUpdated: 2, errors: 0 };
  if (MODE === 'new') {
    if (scenario === 'success') return [200, { ...base, failures: [] }];
    if (scenario === 'partial') return [200, { ...base, errors: failuresNew.length, failures: failuresNew }];
    if (scenario === 'allfail') return [200, { processedCount: 2, songsImported: 0, songsUpdated: 0, chartsImported: 0, chartsUpdated: 0,
      errors: 2, failures: failuresNew.slice(0, 2).map((f, i) => ({ ...f, row: i + 1 })) }];
  } else {
    if (scenario === 'success') return [200, base];
    if (scenario === 'partial') return [200, { ...base, errors: 4 }];
    if (scenario === 'allfail') return [200, { processedCount: 2, songsImported: 0, songsUpdated: 0, chartsImported: 0, chartsUpdated: 0, errors: 2 }];
  }
  if (scenario === 'http500') return [500, { timestamp: '2026-09-29T00:00:00', status: 500, error: 'Internal Server Error', path: '/api/admin/bootstrap/iidx/csv' }];
  if (scenario === 'http403') return [403, { status: 403, error: 'Forbidden', message: 'Access Denied' }];
  return [400, { message: `unknown scenario ${scenario}` }];
};

// ---------- http ----------
const brokenChunks = new Set();
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
const cookies = (req) => Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).filter(Boolean).map((c) => c.split('=')));

const api = (req, res, url, body) => {
  const p = url.pathname.replace(/^\/api/, '');
  const q = url.searchParams;
  const anon = cookies(req).probeAnon === '1';
  if (req.method === 'GET' && p === '/users/me') {
    if (anon) return json(res, 401, { status: 401, code: 'UNAUTHENTICATED', message: 'Unauthorized' });
    return json(res, 200, { id: 1, username: 'validator', email: 'validator@example.test', role: 'ADMIN', avatarUrl: null });
  }
  if (req.method === 'GET' && p === '/auth/providers') return json(res, 200, { google: { enabled: false, enrollmentEnabled: false } });
  if (req.method === 'GET' && p === '/auth/google/pending') return json(res, 404, { status: 404, message: 'No pending' });
  if (req.method === 'GET' && p === '/users/me/login-methods') return json(res, 200, { passwordEnabled: true, googleLinked: false });
  if (req.method === 'GET' && p === '/scores') {
    let rows = scores.map(forMode);
    const ct = q.get('clearType');
    if (ct) rows = rows.filter((r) => r.bestClearType === ct);
    const size = Number(q.get('size') ?? 20);
    const page = Number(q.get('page') ?? 0);
    const content = rows.slice(page * size, page * size + size);
    return json(res, 200, { content, totalElements: rows.length, totalPages: Math.ceil(rows.length / size), number: page, size });
  }
  const tierMatch = p.match(/^\/tiers\/(\d+)\/(SP|DP)$/);
  if (req.method === 'GET' && tierMatch) return json(res, 200, tierItems);
  if (req.method === 'GET' && p === '/tier-shares/me') return json(res, 200, { enabled: false, shareId: null });
  const pub = p.match(/^\/public\/tier-tables\/([^/]+)$/);
  if (req.method === 'GET' && pub) {
    const clearByTitle = new Map(scores.map((s) => [`${s.song.title}|${s.chart.chartType}`, s.bestClearType]));
    return json(res, 200, { ownerUsername: 'validator', level: 12, playStyle: 'SP',
      tierItems: tierItems.map((it) => ({ ...it, clearType: clearByTitle.get(`${it.title}|${it.difficulty}`) ?? 'NO_PLAY' })) });
  }
  if (req.method === 'GET' && p === '/admin/songs') return json(res, 200, tierItems.map(({ title, difficulty }) => ({ title, difficulty, level: 12, playStyle: 'SP' })));
  if (req.method === 'GET' && p === '/admin/tier-table/draft') return json(res, 200, tierItems);
  if (req.method === 'GET' && p === '/admin/tier-table/history') return json(res, 200, []);
  if (req.method === 'POST' && p === '/admin/bootstrap/iidx/csv') {
    const m = body.toString('utf8').match(/SCENARIO=(\w+)/);
    const [status, payload] = bootstrap(m?.[1]);
    log(`bootstrap scenario=${m?.[1]} -> ${status}`);
    return json(res, status, payload);
  }
  log(`UNHANDLED ${req.method} ${url.pathname}${url.search}`);
  return json(res, 404, { status: 404, message: 'not faked' });
};

// Caddy's `encode zstd gzip` compresses text responses; gzip stands in for it.
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg)/;
const sendPerf = (req, res, status, type, cache, body) => {
  const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
  return res.end(gzip ? gzipSync(body) : body);
};

createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const origStatus = res.writeHead.bind(res);
    res.writeHead = (status, ...rest) => { log(`${req.method} ${url.pathname}${url.search} ${status}`); return origStatus(status, ...rest); };
    if (url.pathname.startsWith('/api/')) return api(req, res, url, Buffer.concat(chunks));
    if (url.pathname === '/__probe.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      return res.end(readFileSync(join(HERE, 'probe.js')));
    }
    if (url.pathname === '/__break') { brokenChunks.add(url.searchParams.get('name')); return json(res, 200, [...brokenChunks]); }
    if (url.pathname === '/__unbreak') { brokenChunks.clear(); return json(res, 200, []); }
    const file = join(DIST, decodeURIComponent(url.pathname));
    const base = url.pathname.split('/').pop();
    if ([...brokenChunks].some((n) => base.startsWith(`${n}-`) && base.endsWith('.js'))) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('gone after deploy');
    }
    if (url.pathname !== '/' && existsSync(file) && statSync(file).isFile()) {
      const type = MIME[extname(file)] ?? 'application/octet-stream';
      if (PERF) {
        const cache = url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
        return sendPerf(req, res, 200, type, cache, readFileSync(file));
      }
      res.writeHead(200, { 'Content-Type': type,
        // no-store so a chunk "removed by a deploy" (/__break) is really refetched, not served from cache.
        'Cache-Control': 'no-store' });
      return res.end(readFileSync(file));
    }
    const index = readFileSync(join(DIST, 'index.html'), 'utf8');
    const status = url.pathname === '/418' ? 418 : 200;
    if (PERF) return sendPerf(req, res, status, 'text/html; charset=utf-8', 'no-cache', Buffer.from(index));
    // SPA fallback with the probe injected ahead of the app's module script.
    const html = index.replace('<head>', '<head>\n    <script src="/__probe.js"></script>');
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(html);
  });
}).listen(PORT, '127.0.0.1', () => { log(`listening ${PORT} mode=${MODE} dist=${DIST}`); console.log(`listening ${PORT} ${MODE}`); });
