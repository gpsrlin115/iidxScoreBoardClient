/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConfig } from 'vite';
import { NOTE_RADAR_MOCK_API_CONTEXT } from '../scripts/note-radar-mock-contract.mjs';
import { noteRadarApiBaseURL, noteRadarMockEnabled } from '../src/api/noteRadarMockGuard.js';

const resolve = (command = 'serve', isPreview = false) => resolveConfig({ logLevel: 'silent' }, command, 'development', 'development', isPreview);
async function environment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  try {
    Object.entries(values).forEach(([name, value]) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; });
    return await callback();
  } finally {
    Object.entries(previous).forEach(([name, value]) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; });
  }
}

test('regular development retains its existing backend proxy and does not install the mock guard', () => environment({ VITE_NOTE_RADAR_MOCK: '0' }, async () => {
  const config = await resolve();
  assert.equal(config.server.proxy['/api'].target, 'http://localhost:8080');
  assert.equal(config.plugins.some((plugin) => plugin.name.includes('note-radar-mock')), false);
}));

test('explicit mock development fixes /api to the isolated loopback mock target', () => environment({ VITE_NOTE_RADAR_MOCK: '1', VITE_API_BASE_URL: '/api' }, async () => {
  const config = await resolve();
  assert.equal(config.server.proxy[NOTE_RADAR_MOCK_API_CONTEXT].target, 'http://127.0.0.1:18084');
  assert.equal(Object.hasOwn(config.server.proxy, '/api'), false);
  assert.ok(config.plugins.some((plugin) => plugin.name.includes('note-radar-mock')));
}));

test('production NODE_ENV cannot bypass the development mock guard or forced same-origin API', () => environment({
  NODE_ENV: 'production', VITE_NOTE_RADAR_MOCK: '1', VITE_API_BASE_URL: 'https://external.example/api',
}, async () => {
  const config = await resolve('serve');
  assert.equal(config.env.DEV, false, 'This reproduces vite serve with a production NODE_ENV');
  assert.equal(config.env.VITE_API_BASE_URL, 'https://external.example/api');
  assert.equal(config.server.proxy[NOTE_RADAR_MOCK_API_CONTEXT].target, 'http://127.0.0.1:18084');
  assert.ok(config.plugins.some((plugin) => plugin.name === 'note-radar-mock-proxy-guard'));
  assert.equal(noteRadarMockEnabled(config.env), true);
  assert.equal(noteRadarApiBaseURL(config.env), '/api');
}));

test('mock environment cannot produce a production build or preview', () => environment({ VITE_NOTE_RADAR_MOCK: '1' }, async () => {
  await assert.rejects(resolve('build'), /mock|모의/i);
  await assert.rejects(resolve('serve', true), /mock|모의/i);
}));

test('deployment build keeps explicit note radar activation and disables mock transport', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-frontend.yml', import.meta.url), 'utf8');
  const step = workflow.match(/- name: Build OCI bundle\n([\s\S]*?)(?=\n\s*- name:|$)/)?.[1];
  assert.ok(step, 'Deploy workflow must retain its OCI bundle build step');
  assert.match(step, /VITE_ENABLE_NOTE_RADAR:\s*\$\{\{ vars\.VITE_ENABLE_NOTE_RADAR \|\| '0' \}\}/);
  assert.match(step, /VITE_NOTE_RADAR_MOCK:\s*'0'/);
  assert.match(step, /run: npm run build:oci/);
  const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(example, /^VITE_ENABLE_NOTE_RADAR=0$/m);
  assert.match(example, /^VITE_NOTE_RADAR_MOCK=0$/m);
});
