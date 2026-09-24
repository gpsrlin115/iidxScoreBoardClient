#!/usr/bin/env node
/**
 * `npm audit --json` 결과를 GitHub 이슈 본문으로 바꿉니다.
 *
 * dependency-audit.yml이 audit-all.json과 audit-prod.json을 만든 뒤 이
 * 스크립트를 돌립니다. 결과물은 두 가지입니다.
 *
 * - audit-report.md : 이슈 본문 (gh issue create --body-file로 넘어갑니다)
 * - stdout의 `total=N` : 워크플로가 $GITHUB_OUTPUT으로 받아 분기에 씁니다
 *
 * stdout은 $GITHUB_OUTPUT으로 그대로 흘러가므로 `total=N` 외에는 아무것도
 * 찍지 않습니다. 사람이 볼 메시지는 전부 stderr로 보냅니다.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const REPORT_FILE = 'audit-report.md';

/**
 * 정상적으로 끝난 검사 결과가 아니면 그 이유를, 맞으면 null을 돌려줍니다.
 *
 * `npm audit`이 실패하는 모양은 두 가지입니다.
 * - JSON이 깨지거나 비어 있음
 * - 레지스트리 연결 실패 등에서 파싱은 되는 오류 JSON을 냄.
 *   `{"message": "...", "error": {...}}` 모양이고 metadata가 없습니다.
 *
 * 어느 쪽이든 취약점 유무를 알 수 없습니다. 이를 0건으로 읽으면 워크플로가
 * 열려 있던 이슈를 "해결됨"으로 닫아버립니다.
 */
const auditProblem = (audit) => {
  if (audit === null || typeof audit !== 'object') return 'JSON 객체가 아닙니다';
  if (audit.error) {
    const detail = audit.message || audit.error.summary || audit.error.code || JSON.stringify(audit.error);
    return `npm이 오류를 보고했습니다: ${detail}`;
  }
  if (typeof audit.metadata?.vulnerabilities?.total !== 'number') {
    return 'metadata.vulnerabilities.total이 없습니다';
  }
  return null;
};

/**
 * audit JSON을 읽고 검사 결과로 쓸 수 있는지 확인합니다. 쓸 수 없으면 이유를
 * 남기고 0이 아닌 코드로 끝냅니다. 이때 stdout에는 아무것도 쓰지 않으므로
 * 워크플로는 `total`을 받지 못하고 다음 단계(이슈 처리)로 가지 않습니다.
 *
 * 운영 전용 결과도 같은 기준을 적용합니다. 그쪽만 오류 JSON이면 운영 건수가
 * 0으로 읽혀 리포트가 "운영 의존성에는 취약점이 없습니다"라고 잘못 말합니다.
 */
const loadAudit = (file) => {
  let audit = null;
  try {
    audit = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`${file}을 파싱하지 못했습니다: ${error.message}`);
  }
  const problem = auditProblem(audit);
  if (problem) {
    console.error(
      `${file}: ${problem}. 취약점 유무를 판단할 수 없으므로 이슈를 건드리지 않고 실패로 끝냅니다.`
    );
    process.exit(1);
  }
  return audit;
};

const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info'];

const countsOf = (audit) => {
  const v = audit?.metadata?.vulnerabilities ?? {};
  return {
    ...Object.fromEntries(SEVERITIES.map((s) => [s, v[s] ?? 0])),
    total: v.total ?? 0,
  };
};

/** `fixAvailable`은 true/false이거나 {name, version, isSemVerMajor} 객체입니다. */
const describeFix = (fixAvailable) => {
  if (fixAvailable === true) return '가능 (기존 범위 안)';
  if (!fixAvailable) return '**없음** — 상위 패키지 대응 대기';
  const major = fixAvailable.isSemVerMajor ? ', **semver-major 승격 필요**' : '';
  return `가능 — ${fixAvailable.name}@${fixAvailable.version}${major}`;
};

const advisoriesOf = (entry) =>
  (entry.via ?? [])
    .filter((via) => typeof via !== 'string')
    .map((via) => `  - ${via.title} ([advisory](${via.url}))`);

const severityTable = (label, counts) =>
  `| ${label} | ${counts.critical} | ${counts.high} | ${counts.moderate} | ${counts.low} | **${counts.total}** |`;

const all = loadAudit('audit-all.json');
const prod = loadAudit('audit-prod.json');

const allCounts = countsOf(all);
const prodCounts = countsOf(prod);
const prodNames = new Set(Object.keys(prod.vulnerabilities ?? {}));

// 취약점이 없으면 리포트를 쓸 필요가 없습니다. 워크플로가 total=0을 보고
// 열려 있던 이슈를 닫는 분기로 갑니다.
if (allCounts.total === 0) {
  console.error('취약점 없음 — 리포트를 만들지 않습니다.');
  console.log('total=0');
  process.exit(0);
}

const lines = [];

lines.push(`\`npm audit\`이 취약 의존성 **${allCounts.total}건**을 보고했습니다.`, '');
lines.push('## 요약', '');
lines.push('| 구분 | critical | high | moderate | low | 합계 |');
lines.push('|---|---|---|---|---|---|');
lines.push(severityTable('전체 (개발 포함)', allCounts));
lines.push(severityTable('운영 의존성만', prodCounts));
lines.push('');

if (prodCounts.total === 0) {
  lines.push('> **운영 의존성에는 취약점이 없습니다.** 아래는 모두 빌드·린트 등 개발 도구의 간접 의존성이며, 배포된 번들에는 들어가지 않습니다.', '');
} else {
  lines.push(`> **운영 의존성에 ${prodCounts.total}건**이 있습니다. 배포된 번들에 포함되는 경로이므로 먼저 보세요.`, '');
}

lines.push('## 상세', '');

const entries = Object.values(all.vulnerabilities ?? {}).sort(
  (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
);

for (const entry of entries) {
  const scope = prodNames.has(entry.name) ? '운영 포함' : '개발 전용';
  lines.push(`### \`${entry.name}\` — ${entry.severity} (${scope})`, '');
  lines.push(`- 영향 범위: \`${entry.range}\``);
  lines.push(`- 직접 의존성 여부: ${entry.isDirect ? '예 (package.json에 있음)' : '아니오 (간접)'}`);
  lines.push(`- 수정: ${describeFix(entry.fixAvailable)}`);
  if (entry.effects?.length) {
    lines.push(`- 이 패키지 때문에 같이 걸리는 것: ${entry.effects.map((e) => `\`${e}\``).join(', ')}`);
  }
  const advisories = advisoriesOf(entry);
  if (advisories.length) {
    lines.push('- advisory:');
    lines.push(...advisories);
  }
  lines.push('');
}

lines.push('## 확인하는 법', '');
lines.push('```bash');
lines.push('npm ci');
lines.push('npm audit              # 전체');
lines.push('npm audit --omit=dev   # 운영 의존성만');
lines.push('```');
lines.push('');
lines.push('대개는 대상을 명시한 `npm update <패키지>`로 해결됩니다. `npm audit fix`는 전체 재설치를 돌면서 무관한 패키지까지 같이 올려 diff가 넓어지니 먼저 쓰지 마세요. `--force`는 semver-major를 끌어와 회귀 위험이 있습니다.', '');
lines.push('---');
lines.push('이 이슈는 `.github/workflows/dependency-audit.yml`이 매주 자동으로 갱신하며, `npm audit`이 다시 0건이 되면 스스로 닫습니다.');

writeFileSync(REPORT_FILE, `${lines.join('\n')}\n`, 'utf8');

console.error(`${REPORT_FILE} 작성 완료 — 전체 ${allCounts.total}건, 운영 ${prodCounts.total}건`);
console.log(`total=${allCounts.total}`);
