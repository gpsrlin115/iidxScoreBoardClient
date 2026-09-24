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
 * audit JSON을 읽습니다.
 *
 * 레지스트리 장애 등으로 `npm audit`이 JSON을 못 뱉는 경우가 있습니다.
 * 여기서 예외를 던지면 워크플로만 죽고 아무도 모르게 되므로, null을
 * 돌려주고 리포트에 그 사실을 적는 쪽을 택합니다.
 */
const readAudit = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`[warn] ${file}을 읽지 못했습니다: ${error.message}`);
    return null;
  }
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

const all = readAudit('audit-all.json');
const prod = readAudit('audit-prod.json');

// 전체 audit을 읽지 못했다면 취약점 유무를 알 수 없습니다. 여기서 total=0을
// 내보내면 워크플로가 "깨끗해졌다"고 판단해 열려 있던 이슈를 닫아버립니다.
// 취약점이 사라진 것과 도구가 고장난 것은 전혀 다르므로 크게 실패시킵니다.
// (운영 전용 audit만 못 읽은 경우는 아래에서 단서를 달고 계속 진행합니다.)
if (all === null) {
  console.error(
    'audit-all.json을 읽을 수 없습니다. npm audit 자체가 실패했을 가능성이 큽니다 ' +
      '(레지스트리 장애, 네트워크 차단 등). 취약점 유무를 판단할 수 없으므로 ' +
      '이슈를 건드리지 않고 실패로 끝냅니다.'
  );
  process.exit(1);
}

const allCounts = countsOf(all);
const prodCounts = countsOf(prod);
const prodNames = new Set(Object.keys(prod?.vulnerabilities ?? {}));

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

if (prod === null) {
  lines.push('> 운영 전용 audit(`--omit=dev`)을 읽지 못해 운영 영향 범위를 가르지 못했습니다. 위 "운영 의존성만" 행은 신뢰하지 마세요.', '');
} else if (prodCounts.total === 0) {
  lines.push('> **운영 의존성에는 취약점이 없습니다.** 아래는 모두 빌드·린트 등 개발 도구의 간접 의존성이며, 배포된 번들에는 들어가지 않습니다.', '');
} else {
  lines.push(`> **운영 의존성에 ${prodCounts.total}건**이 있습니다. 배포된 번들에 포함되는 경로이므로 먼저 보세요.`, '');
}

lines.push('## 상세', '');

const entries = Object.values(all?.vulnerabilities ?? {}).sort(
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
