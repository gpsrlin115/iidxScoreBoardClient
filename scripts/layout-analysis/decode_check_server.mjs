/**
 * Runs the local-file decode path in a real browser and collects what it read.
 *
 *     node scripts/layout-analysis/decode_check_server.mjs [--browser chrome|firefox|none] [--out DIR]
 *         [--only VIDEO_ID] [--regular FILE.mp4]...
 *
 * WSL has no browser of its own, and a Windows browser's debugging port cannot
 * be reached from WSL (the network is NAT'd), so the page reports back instead:
 * this server hands it decode-check.html, the source modules and the clips on
 * one origin, and the page POSTs every run's result here. With --browser it
 * also starts a headless Windows browser on a throwaway profile, waits for the
 * page to finish, and stops only the processes using that profile.
 *
 * The runs, per labelled clip, on the window its Node fixture was cut from and
 * with the sidecar's audited geometry (so the result can be set beside
 * run_worker_node.mjs's):
 *   worker ×3   the real detector.worker.js, as the page runs it — three times,
 *               because a file decodes the same way every time or not at all
 *   slow        the same modules with 20ms added to every frame's analysis,
 *               which makes it slower than playback; it must read the same frames
 *   offkey      the window started 2.37s later, between keyframes
 * and one worker run for each regular (unfragmented) copy of a clip given with
 * --regular. Results land in --out (test/fixtures/worker-clips/browser/<browser>
 * by default); the first worker run of each clip is also written in the shape
 * match_with_sidecar.py reads.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';

const ROOT = process.cwd();
const PORT = 5181;
const SIDECAR = '/home/administrator/iidxRandomAnalyzer';
const CLIPS = path.join(os.homedir(), '.cache', 'iidaran', 'clips');
const LABELLED = ['zqQygwU_8Q0', 'agoYv4Vnsaw', 'JTTV4NHuQsA', 'wGbgc0vrxkY'];
const OFF_KEYFRAME_S = 2.37;
const BROWSERS = {
  chrome: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
  firefox: '/mnt/c/Program Files/Mozilla Firefox/firefox.exe',
};

const option = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const browser = option('--browser', 'chrome');
const out = path.resolve(option('--out', path.join('test', 'fixtures', 'worker-clips', 'browser', browser)));
const regular = process.argv.flatMap((arg, index) => (process.argv[index - 1] === '--regular' ? [path.resolve(arg)] : []));
const only = option('--only', null);
fs.mkdirSync(out, { recursive: true });

const audit = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(SIDECAR, 'validation', 'real-clip-audit-2026-09-09.json'), 'utf8'))
  .map((row) => [row.videoId, row]));
const starts = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(SIDECAR, 'tests', 'fixtures', 'auto-roi', 'manifest.json'), 'utf8'))
  .clips.map((clip) => [clip.videoId, clip.startSeconds ?? 0]));

// extract_worker_frames.py seeks to frame int(start × 60), so the window here
// starts on that frame's time.
const fixtureStart = (videoId) => Math.floor(starts[videoId] * 60) / 60;
const files = {};
const runs = [];
for (const videoId of LABELLED.filter((id) => !only || id === only)) {
  files[`${videoId}.mp4`] = path.join(CLIPS, `${videoId}.mp4`);
  const base = { videoId, clip: `${videoId}.mp4`, geometry: audit[videoId].geometry, durationMs: 30_000, startSeconds: fixtureStart(videoId) };
  for (let repeat = 1; repeat <= 3; repeat += 1) runs.push({ ...base, id: `${videoId}.worker${repeat}`, mode: 'worker' });
  runs.push({ ...base, id: `${videoId}.slow`, mode: 'slow', frameCostMs: 20 });
  runs.push({ ...base, id: `${videoId}.offkey`, mode: 'worker', startSeconds: base.startSeconds + OFF_KEYFRAME_S });
}
for (const file of regular) {
  const name = path.basename(file);
  const videoId = name.slice(0, 11);
  files[name] = file;
  runs.push({ videoId, clip: name, id: name.replace(/\.mp4$/, ''), mode: 'worker', geometry: audit[videoId].geometry, durationMs: 30_000, startSeconds: fixtureStart(videoId) });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const summary = [];
let finished = null;
const done = new Promise((resolve) => { finished = resolve; });

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  if (request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      if (url.pathname === '/report') {
        const report = JSON.parse(body);
        fs.writeFileSync(path.join(out, `${report.id}.json`), `${JSON.stringify(report)}\n`);
        const notes = report.observedNotes;
        if (notes && report.id.endsWith('.worker1')) {
          fs.writeFileSync(path.join(out, `${report.videoId}.observed.json`), `${JSON.stringify({
            videoId: report.videoId, bandY: notes.geometry.analysisY, fps: notes.fps, durationMs: notes.durationMs,
            frameCount: notes.frameCount, laneEventCounts: notes.laneEventCounts, events: notes.events,
          })}\n`);
        }
        const capture = notes?.capture;
        summary.push(report);
        console.log(`${report.id.padEnd(34)} ${report.error ? `오류: ${report.error}` : [
          `프레임 ${capture.frames}/${capture.expectedFrames}`,
          `최대 공백 ${capture.maxGapMs.toFixed(1)}ms`,
          `초당 ${capture.ratePerSecond?.toFixed(2)}`,
          `이벤트 ${notes.events.length}`,
          `처리 ${(capture.wallMs / 1000).toFixed(1)}초`,
          `첫 프레임 ${report.firstFrameUs === undefined ? '?' : (report.firstFrameUs / 1e6).toFixed(3)}초`,
        ].join(' · ')}`);
      }
      if (url.pathname === '/done') finished(JSON.parse(body || '{}'));
      response.writeHead(204).end();
    });
    return;
  }
  if (url.pathname === '/runs.json') {
    response.writeHead(200, { 'content-type': MIME['.json'] }).end(JSON.stringify(runs));
    return;
  }
  if (url.pathname.startsWith('/clip/')) {
    const file = files[decodeURIComponent(url.pathname.slice('/clip/'.length))];
    if (!file) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': 'video/mp4', 'content-length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(response);
    return;
  }
  const relative = url.pathname === '/' ? 'scripts/layout-analysis/decode-check.html' : url.pathname.slice(1);
  const file = path.resolve(ROOT, relative);
  // Only the page and the source tree are served.
  const allowed = file === path.join(ROOT, 'scripts/layout-analysis/decode-check.html') || file.startsWith(path.join(ROOT, 'src') + path.sep);
  if (!allowed || !fs.existsSync(file)) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

// cmd.exe refuses a UNC working directory, which is what a WSL path becomes.
const cmd = (...args) => execFileSync('cmd.exe', ['/c', ...args], { encoding: 'utf8', cwd: '/mnt/c', stdio: ['ignore', 'pipe', 'ignore'] });
const windowsTemp = () => cmd('echo %TEMP%').trim();
const launch = () => {
  if (browser === 'none') return null;
  const profile = `${windowsTemp()}\\decode-check-${browser}-${Date.now()}`;
  const url = `http://localhost:${PORT}/`;
  const args = browser === 'chrome'
    ? ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, url]
    : ['--headless', '--no-remote', '-profile', profile, url];
  if (browser === 'firefox') cmd('mkdir', profile);
  spawn(BROWSERS[browser], args, { stdio: 'ignore', detached: true }).unref();
  return profile;
};

// The launcher exits at once and leaves the real browser holding the profile,
// so the browser is found by its command line, never by the launcher's PID —
// and only processes naming this run's profile are stopped.
const stopBrowser = (profile) => {
  if (!profile) return;
  const script = path.join(os.tmpdir(), `stop-decode-check-${Date.now()}.ps1`);
  const image = browser === 'chrome' ? 'chrome.exe' : 'firefox.exe';
  fs.writeFileSync(script, `Get-CimInstance Win32_Process -Filter "Name = '${image}'" | Where-Object { $_.CommandLine -like '*${path.win32.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }\n`);
  const windowsScript = execFileSync('wslpath', ['-w', script], { encoding: 'utf8' }).trim();
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', windowsScript], { stdio: 'ignore', cwd: '/mnt/c' });
  fs.rmSync(script);
  // The profile holds the clips the page fetched, hundreds of megabytes each
  // run. It is removed before this script exits, retried while the stopped
  // browser still has files open.
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { cmd('rmdir', '/s', '/q', profile); } catch { /* still in use */ }
    if (!fs.existsSync(execFileSync('wslpath', [profile], { encoding: 'utf8' }).trim())) return;
    Atomics.wait(pause, 0, 0, 500);
  }
  console.log(`임시 프로필을 지우지 못했습니다: ${profile}`);
};

const sameEvents = (left, right) => JSON.stringify(left?.observedNotes?.events) === JSON.stringify(right?.observedNotes?.events);
const sameFrames = (left, right) => JSON.stringify(left?.observedNotes?.capture.frameTimesMs) === JSON.stringify(right?.observedNotes?.capture.frameTimesMs);

/**
 * Of the browser's events, the share that have one in the Node run over the
 * same frames (OpenCV-decoded) in the same lane within a frame of it. The two
 * decoders convert colour slightly differently, so this is near 1, not 1.
 */
const agreementWithNode = (report) => {
  const nodeFile = path.join(ROOT, 'test', 'fixtures', 'worker-clips', `${report.videoId}.observed.json`);
  if (!fs.existsSync(nodeFile)) return null;
  const node = JSON.parse(fs.readFileSync(nodeFile, 'utf8')).events;
  const events = report.observedNotes.events;
  const matched = events.filter((event) => node.some((other) => other.lane === event.lane && Math.abs(other.timeMs - event.timeMs) <= 17)).length;
  return { browser: events.length, node: node.length, matched };
};

/** The checks the plan set for this path, answered from the reports. */
const verdicts = (reports) => {
  const byId = Object.fromEntries(reports.map((report) => [report.id, report]));
  const lines = [];
  const check = (label, ok, detail = '') => { lines.push({ label, ok, detail }); };
  for (const report of reports) {
    const capture = report.observedNotes?.capture;
    check(`${report.id}: 구간 안 프레임을 모두 읽음`, !report.error && capture.frames === capture.expectedFrames && capture.maxGapMs < 17.5,
      report.error || `${capture.frames}/${capture.expectedFrames}, 최대 공백 ${capture.maxGapMs.toFixed(1)}ms`);
  }
  for (const videoId of LABELLED) {
    const first = byId[`${videoId}.worker1`];
    if (!first?.observedNotes) continue;
    for (const other of [`${videoId}.worker2`, `${videoId}.worker3`, `${videoId}.slow`]) {
      check(`${other} = worker1 (프레임 시각·이벤트)`, sameFrames(byId[other], first) && sameEvents(byId[other], first));
    }
    const offkey = byId[`${videoId}.offkey`];
    if (offkey?.observedNotes) {
      check(`${videoId}.offkey: 시작 전 프레임 제외`, offkey.firstFrameUs >= offkey.windowStartUs
        && offkey.firstFrameUs - offkey.windowStartUs < 16_667, `시작 ${offkey.windowStartUs}µs, 첫 프레임 ${offkey.firstFrameUs}µs`);
    }
    const agreement = agreementWithNode(first);
    if (agreement) {
      check(`${videoId}: Node 경로와 이벤트 대조`, agreement.matched / agreement.browser >= 0.98,
        `브라우저 ${agreement.browser}개 중 ${agreement.matched}개가 Node(${agreement.node}개)와 같은 레인·1프레임 안`);
    }
  }
  for (const report of reports.filter((candidate) => candidate.mode === 'worker' && !candidate.id.includes('.worker') && !candidate.id.endsWith('.offkey'))) {
    const original = byId[`${report.videoId}.worker1`];
    check(`${report.id} = 원본 조각 MP4 (프레임 시각·이벤트)`, sameFrames(report, original) && sameEvents(report, original));
  }
  return lines;
};

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`http://localhost:${PORT}/ — ${runs.length}개 실행, 결과는 ${out}`);
  const profile = launch();
  const timeout = setTimeout(() => finished({ timedOut: true }), 15 * 60_000);
  const ending = await done;
  clearTimeout(timeout);
  stopBrowser(profile);
  const checks = verdicts(summary);
  fs.writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify({ browser, ending, userAgent: summary[0]?.userAgent, checks, runs: summary.map(({ observedNotes, ...rest }) => ({ ...rest, capture: observedNotes?.capture && { ...observedNotes.capture, frameTimesMs: undefined }, events: observedNotes?.events.length })) }, null, 2)}\n`);
  console.log(`\n${summary[0]?.userAgent ?? ''}`);
  for (const line of checks) console.log(`${line.ok ? 'ok  ' : 'FAIL'} ${line.label}${line.detail ? ` — ${line.detail}` : ''}`);
  const failed = checks.filter((line) => !line.ok).length;
  console.log(ending.timedOut ? '\n15분 안에 끝나지 않았습니다' : `\n${checks.length - failed}/${checks.length} 확인 통과 (${summary.length}개 보고)`);
  server.close();
  process.exit(ending.timedOut || failed ? 1 : 0);
});
