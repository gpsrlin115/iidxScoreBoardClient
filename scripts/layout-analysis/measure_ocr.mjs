/**
 * Measures how often the banner OCR reads the chart back correctly.
 *
 * Run after scripts/layout-analysis/extract_ocr_banners.py:
 *     node scripts/layout-analysis/measure_ocr.mjs
 *
 * This runs tesseract.js under Node, not in a browser. It is the same package
 * version, the same WASM core and the same traineddata the page loads, and it
 * reads the identical crop, but the image reaches tesseract through Node rather
 * than through a canvas. A browser number still has to be measured separately:
 * headless Chrome here cannot be awaited, because --dump-dom does not wait for
 * a Web Worker and Chrome's debugging port is not reachable from WSL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { summarizeLevels } from '../../src/features/layoutAnalysis/ocrLevel.js';

const FIXTURES = path.join(process.cwd(), 'test', 'fixtures', 'ocr-banners');
const DIFFICULTY = /\b(BEGINNER|NORMAL|HYPER|ANOTHER|LEGGENDARIA)\b/gi;

const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const verdictFor = (text, expectedTitle) => {
  const read = normalize(text);
  const expected = normalize(expectedTitle);
  if (!expected) return 'no-ground-truth';
  if (read.includes(expected)) return '성공';
  // A banner read as something else is a misread; nothing recognisable at all
  // is a non-read, and the two need different fixes.
  return read.length > 8 ? '오독' : '미판독';
};

const run = async () => {
  const manifestPath = path.join(FIXTURES, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('no banners; run scripts/layout-analysis/extract_ocr_banners.py first');
    process.exit(1);
  }
  const { samples } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const worker = await createWorker(['eng', 'jpn']);
  const rows = [];
  try {
    for (const sample of samples) {
      const started = Date.now();
      const result = await worker.recognize(path.join(FIXTURES, sample.file));
      const elapsedMs = Date.now() - started;
      const text = result.data.text.replace(/\s+/g, ' ').trim();
      rows.push({
        file: sample.file,
        expectedTitle: sample.expectedTitle,
        expectedDifficulty: sample.expectedDifficulty,
        elapsedMs,
        text: text.slice(0, 255),
        titleVerdict: verdictFor(text, sample.expectedTitle),
        difficulties: [...new Set([...text.matchAll(DIFFICULTY)].map((match) => match[1].toUpperCase()))],
        levels: summarizeLevels([text]),
      });
      process.stderr.write(`${sample.file} ${elapsedMs}ms\n`);
    }
  } finally {
    await worker.terminate();
  }

  const lines = [
    '# 배너 OCR 판독률 측정',
    '',
    `측정 환경: Node ${process.version}, tesseract.js 7.0.0, eng+jpn traineddata, 크롭은 ocr.js 의 ocrCrop 과 동일.`,
    '**브라우저에서 잰 값이 아니다.** 같은 패키지·WASM 코어·언어자료·크롭을 쓰지만 이미지가',
    'canvas 가 아니라 Node 를 거쳐 들어간다. 브라우저 수치는 아직 없다.',
    '',
    '| 표본 | 정답 제목 | 판독 결과(앞부분) | 제목 | 난이도 | 레벨(원문→보정) | ms |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const levels = row.levels.perFrame.flat().map((token) => `${token.raw}→${token.corrected ?? '?'}`).join(', ') || '—';
    const read = row.difficulties.join(', ') || '—';
    const difficulties = row.difficulties.includes(row.expectedDifficulty) ? read : `${read} (정답 ${row.expectedDifficulty})`;
    lines.push(`| ${row.file} | ${row.expectedTitle} | ${row.text.slice(0, 60).replace(/\|/g, '/')} | ${row.titleVerdict} | ${difficulties} | ${levels} | ${row.elapsedMs} |`);
  }

  const totals = (predicate) => rows.filter(predicate).length;
  lines.push('', '## 요약', '');
  lines.push(`- 표본 ${rows.length}장`);
  lines.push(`- 제목 성공 ${totals((row) => row.titleVerdict === '성공')} · 오독 ${totals((row) => row.titleVerdict === '오독')} · 미판독 ${totals((row) => row.titleVerdict === '미판독')}`);
  lines.push(`- 난이도 일치 ${totals((row) => row.difficulties.includes(row.expectedDifficulty))}`);
  lines.push(`- 레벨 토큰이 잡힌 표본 ${totals((row) => row.levels.values.length > 0)} (레벨 정답 라벨이 없어 성공률은 내지 않는다)`);
  lines.push(`- 표본당 평균 ${Math.round(rows.reduce((sum, row) => sum + row.elapsedMs, 0) / rows.length)}ms`);
  lines.push('', '판독률을 재기 전에는 후보를 제목·난이도·레벨로 걸러내지 않는다.');

  fs.writeFileSync(path.join(FIXTURES, 'report.md'), `${lines.join('\n')}\n`);
  fs.writeFileSync(path.join(FIXTURES, 'report.json'), `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`wrote ${path.join(FIXTURES, 'report.md')}`);
};

run();
