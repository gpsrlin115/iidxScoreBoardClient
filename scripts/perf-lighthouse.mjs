// Lighthouse reports for the main screens, run against the production bundle.
//
//   npm run perf              # every page in PAGES
//   npm run perf -- scores    # only the named pages
//   npm run perf:login        # same as `npm run perf -- login`
//
// Protected pages need a signed-in user and score data, so the bundle is served
// by the release-validation fake backend (scripts/release-validation/server.mjs)
// in --perf mode: fixed fake /api responses, production cache headers, gzip,
// and no probe script. Results are repeatable and never touch a real server.
//
// Chrome: lighthouse finds an installed Chrome by itself. Where there is none
// (WSL), point CHROME_PATH at one, e.g. the Chrome for Testing that
// `npx @puppeteer/browsers install chrome@stable` downloads.
import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const port = '4180';
const origin = `http://localhost:${port}`;
const reportDir = resolve('reports/lighthouse');
const chromeFlags = '--headless=new --no-sandbox';

// The fake backend answers /api/users/me with a signed-in user unless this
// cookie is set, so public pages like /login need it to stay on screen.
const ANON = { Cookie: 'probeAnon=1' };
const PAGES = {
  login: { path: '/login', headers: ANON },
  dashboard: { path: '/' },
  scores: { path: '/scores' },
  tier: { path: '/tier-table' },
  import: { path: '/import/csv' },
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runLighthouse(name, { path, headers }) {
  // Two outputs from one run: <name>.report.json and <name>.report.html.
  // Run from the OS temp dir: under WSL, chrome-launcher builds its profile
  // dir from the Windows LOCALAPPDATA path and creates it, literally named
  // `C:\Users\...\lighthouse.NNNN`, relative to the working directory -- and
  // leaves it behind. Started from the repo, that was a 3MB folder per run.
  await run(npxCommand, [
    '--yes',
    'lighthouse',
    `${origin}${path}`,
    '--only-categories=performance,accessibility,best-practices,seo',
    '--output=json',
    '--output=html',
    `--output-path=${reportDir}/${name}`,
    '--quiet',
    `--chrome-flags=${chromeFlags}`,
    ...(headers ? [`--extra-headers=${JSON.stringify(headers)}`] : []),
  ], { cwd: tmpdir() });

  const report = JSON.parse(await readFile(`${reportDir}/${name}.report.json`, 'utf8'));
  const score = (id) => Math.round(report.categories[id].score * 100);
  const value = (id) => report.audits[id].displayValue;
  return {
    page: name,
    perf: score('performance'),
    a11y: score('accessibility'),
    bp: score('best-practices'),
    seo: score('seo'),
    LCP: value('largest-contentful-paint'),
    TBT: value('total-blocking-time'),
    CLS: value('cumulative-layout-shift'),
  };
}

async function main() {
  const requested = process.argv.slice(2);
  const unknown = requested.filter((name) => !PAGES[name]);
  if (unknown.length) throw new Error(`Unknown page(s): ${unknown.join(', ')}. Known: ${Object.keys(PAGES).join(', ')}`);
  const names = requested.length ? requested : Object.keys(PAGES);

  await mkdir(reportDir, { recursive: true });

  console.log('\n[perf] Building production bundle...');
  await run(npmCommand, ['run', 'build:oci']);

  console.log('\n[perf] Starting fake backend...');
  const server = spawn(
    process.execPath,
    ['scripts/release-validation/server.mjs', '--dist', 'dist', '--port', port, '--mode', 'new', '--perf', '1'],
    { stdio: 'inherit', shell: false }
  );
  const shutdown = () => {
    if (!server.killed) server.kill('SIGTERM');
  };
  process.on('exit', shutdown);
  process.on('SIGINT', () => { shutdown(); process.exit(130); });
  process.on('SIGTERM', () => { shutdown(); process.exit(143); });

  try {
    await waitForServer(`${origin}/login`);
    const rows = [];
    for (const name of names) {
      console.log(`\n[perf] Lighthouse: ${name} (${PAGES[name].path})`);
      rows.push(await runLighthouse(name, PAGES[name]));
    }
    console.log('\n[perf] Reports saved to reports/lighthouse/');
    console.table(rows);
  } finally {
    shutdown();
  }
}

main().catch((error) => {
  console.error(`\n[perf] ${error.message}`);
  process.exit(1);
});
