import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';

// .github/scripts/audit-report.mjs is a CLI: it reads audit-all.json and
// audit-prod.json from the working directory, writes audit-report.md, and
// prints only `total=N` to stdout for the workflow's $GITHUB_OUTPUT. The
// workflow closes the open report issue when it sees total=0, so the tests
// below care most about when the script must NOT print total=0.
const SCRIPT = fileURLToPath(new URL('../.github/scripts/audit-report.mjs', import.meta.url));

const counts = (overrides = {}) => ({
  info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...overrides,
});

const cleanAudit = () => ({
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: counts() },
});

const devOnlyAudit = () => ({
  auditReportVersion: 2,
  vulnerabilities: {
    'js-yaml': {
      name: 'js-yaml',
      severity: 'high',
      isDirect: false,
      via: [{ title: 'quadratic merge', url: 'https://github.com/advisories/GHSA-test' }],
      effects: [],
      range: '4.0.0 - 4.3.1',
      nodes: ['node_modules/js-yaml'],
      fixAvailable: true,
    },
  },
  metadata: { vulnerabilities: counts({ high: 1, total: 1 }) },
});

// Captured from `npm audit --json --registry=http://127.0.0.1:9`: npm exits
// non-zero but still prints parseable JSON, with no metadata at all.
const registryFailure = () => ({
  message: 'request to http://127.0.0.1:9/-/npm/v1/security/audits/quick failed, reason: connect ECONNREFUSED 127.0.0.1:9',
  error: { summary: '', detail: '' },
});

const run = ({ all, prod }) => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-report-'));
  try {
    const write = (file, value) =>
      writeFileSync(join(dir, file), typeof value === 'string' ? value : JSON.stringify(value));
    write('audit-all.json', all);
    write('audit-prod.json', prod);

    const result = spawnSync(execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
    const reportPath = join(dir, 'audit-report.md');
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      report: existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('a registry failure is reported as a failed check, never as zero vulnerabilities', () => {
  // Regression guard: this used to print total=0 and exit 0, which made the
  // workflow close the open report issue as if everything had been fixed.
  const result = run({ all: registryFailure(), prod: registryFailure() });

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ECONNREFUSED/);
});

test('a failed production-only audit also fails the check', () => {
  // Otherwise the report would read production as 0 and say production is clean.
  const result = run({ all: devOnlyAudit(), prod: registryFailure() });

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.report, null);
});

test('unparseable or metadata-less output fails the check', () => {
  for (const broken of ['not json', 'null', '[]', { auditReportVersion: 2, vulnerabilities: {} }]) {
    const result = run({ all: broken, prod: cleanAudit() });

    assert.notEqual(result.status, 0, `accepted ${JSON.stringify(broken)}`);
    assert.equal(result.stdout, '');
  }
});

test('a clean audit prints total=0 and writes no report', () => {
  const result = run({ all: cleanAudit(), prod: cleanAudit() });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'total=0\n');
  assert.equal(result.report, null);
});

test('findings print the total and name each package, marking dev-only ones', () => {
  const result = run({ all: devOnlyAudit(), prod: cleanAudit() });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'total=1\n');
  assert.match(result.report, /`js-yaml` — high \(개발 전용\)/);
  assert.match(result.report, /운영 의존성에는 취약점이 없습니다/);
  assert.match(result.report, /GHSA-test/);
});
