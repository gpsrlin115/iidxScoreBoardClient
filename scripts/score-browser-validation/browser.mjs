// Run against the explicit mock pair only; never use a real account or remote API.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://127.0.0.1:18087';
const mock = 'http://127.0.0.1:18086';
const output = resolve('reports/score-browser');
await mkdir(output, { recursive: true });
const identity = await fetch(`${mock}/__mock/identity`);
assert.equal(identity.headers.get('x-score-browser-mock'), '1');
assert.deepEqual(await identity.json(), { service: 'iidx-score-browser-mock', version: 1 });
const control = async (body) => {
  const response = await fetch(`${mock}/__mock/control`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
};
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
// Deterministic paging exercises the keyboard-accessible fallback button.
await context.addInitScript(() => { delete window.IntersectionObserver; });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const cards = page.locator('button[aria-haspopup="dialog"]');
const search = page.getByRole('searchbox', { name: '곡 제목·아티스트 검색' });
const level = page.getByRole('combobox', { name: '레벨', exact: true });
const series = page.getByRole('combobox', { name: '시리즈', exact: true });
const wait = async (predicate) => {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await page.waitForTimeout(50); }
  throw new Error('Timed out waiting for score browser state');
};
const waitCount = (n) => wait(async () => await cards.count() === n);
const selectedLevel = async (value) => { await level.selectOption(value); await waitCount(24); };
try {
  await control({ reset: true });
  await page.goto(`${base}/scores`);
  await page.getByText('스코어 검증용 모의 데이터', { exact: false }).waitFor();
  await waitCount(24);
  assert.equal(await level.inputValue(), '');
  assert.match(await page.locator('body').innerText(), /총 1,152개/);
  for (const style of ['SP', 'DP']) {
    await page.getByRole('button', { name: style, exact: true }).click();
    for (const value of ['', '1', '9', '10', '11', '12']) {
      await selectedLevel(value);
      if (value) assert.match(await cards.first().innerText(), new RegExp(`☆${value}\\b`));
    }
  }
  await page.getByRole('button', { name: 'SP', exact: true }).click();
  await selectedLevel('');
  const another = page.getByRole('button', { name: '동일 제목 채보 검증 SP ANOTHER 상세 점수 보기', exact: true });
  await another.focus();
  await another.press('Enter');
  await page.getByRole('dialog').waitFor();
  await page.getByText('MOCK 채보 10002의 댓글입니다.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await another.evaluate((node) => node === document.activeElement), true);
  const hyper = page.getByRole('button', { name: '동일 제목 채보 검증 SP HYPER 상세 점수 보기', exact: true });
  await hyper.focus();
  await hyper.press('Space');
  await page.getByRole('dialog').waitFor();
  await page.getByText('MOCK 채보 10001의 댓글입니다.', { exact: true }).waitFor();
  await page.getByText('티어 미배정 채보는 투표할 수 없습니다.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('group', { name: '티어 적정성 투표' }).count(), 0);
  await page.getByRole('button', { name: '상세 점수 닫기' }).click();
  await search.fill('AFTER-1000');
  await waitCount(1);
  assert.match(await cards.first().innerText(), /AFTER-1000 SP TARGET/);
  await search.fill('');
  await waitCount(24);
  await series.selectOption('IIDX 33');
  await waitCount(24);
  assert.equal(await cards.evaluateAll((nodes) => nodes.every((node) => node.textContent.includes('IIDX 33'))), true);
  await series.selectOption('');
  await page.getByRole('button', { name: '오래된 시리즈순', exact: true }).click();
  await wait(() => cards.first().innerText().then((text) => text.includes('IIDX 1')));
  await page.getByRole('button', { name: '최신 시리즈순', exact: true }).click();
  await wait(() => cards.first().innerText().then((text) => text.includes('IIDX 34')));
  await page.getByRole('button', { name: 'EX', exact: true }).click();
  await waitCount(24);
  await control({ failNextPage: 1 });
  await page.getByRole('button', { name: /^더 보기/ }).click();
  await page.getByText('다음 스코어를 불러오지 못했습니다.').waitFor();
  assert.equal(await cards.count(), 24);
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await waitCount(48);
  for (let count = 72; count <= 1152; count += 24) {
    await page.getByRole('button', { name: /^더 보기/ }).click();
    await waitCount(count);
  }
  assert.equal(await cards.count(), 1152);
  assert.equal(await page.getByRole('button', { name: /^더 보기/ }).count(), 0);
  assert.equal(await cards.evaluateAll((nodes) => nodes.some((node) => node.textContent.includes('시리즈 정보 없음'))), true);
  assert.equal(await cards.evaluateAll((nodes) => nodes.some((node) => node.textContent.includes('UNKNOWN_RAW_VERSION'))), true);
  await search.fill('AFTER-1000');
  await waitCount(1);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}/mobile-list.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await cards.first().scrollIntoViewIfNeeded();
  const listScroll = await page.evaluate(() => scrollY);
  await cards.first().click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: `${output}/mobile-dialog.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => scrollY), listScroll);
  await page.setViewportSize({ width: 1365, height: 900 });
  await search.fill(''); await waitCount(24);
  await page.screenshot({ path: `${output}/desktop-list.png`, fullPage: true });
  const autoContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const autoPage = await autoContext.newPage();
  await autoPage.goto(`${base}/scores`);
  await autoPage.locator('button[aria-haspopup="dialog"]').first().waitFor();
  await autoPage.getByRole('button', { name: /^더 보기/ }).scrollIntoViewIfNeeded();
  await autoPage.waitForFunction(() => document.querySelectorAll('button[aria-haspopup="dialog"]').length >= 48);
  await autoContext.close();
  assert.deepEqual(errors, []);
  console.log('PASS: SP/DP levels, exact-chart dialogs, Enter/Space/focus, series filters/sorts, >1000 paging, retry, 320px overflow. MOCK ONLY.');
} finally { await browser.close(); }
