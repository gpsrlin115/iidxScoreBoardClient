import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

// features.js reads import.meta.env at load time, which only exists under Vite.
let vite;
let isRivalCollectionEnabled;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ isRivalCollectionEnabled } = await vite.ssrLoadModule('/src/config/features.js'));
});

after(async () => {
  await vite?.close();
});

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('server rival collection is on only for the exact build value "1"', () => {
  assert.equal(isRivalCollectionEnabled({ VITE_ENABLE_RIVAL_COLLECTION: '1' }), true);
  for (const value of ['0', '', 'true', 'yes', 1, undefined]) {
    assert.equal(isRivalCollectionEnabled({ VITE_ENABLE_RIVAL_COLLECTION: value }), false, String(value));
  }
  assert.equal(isRivalCollectionEnabled({}), false);
  assert.equal(isRivalCollectionEnabled(undefined), false);
});

// The three entry points are mounted from page/route files that need a full app to
// render, so their gating is pinned statically here.
test('the import card (with its polling hook), the profile section, and the popup route all sit behind the flag', () => {
  const csvUpload = source('src/pages/CsvUpload.jsx');
  assert.match(csvUpload, /\{ENABLE_RIVAL_COLLECTION && \(\s*<div[^>]*>\s*<RivalCollectionSection \/>/);
  // The hook must not run at page level, or GETs and polling continue with the card hidden.
  assert.doesNotMatch(csvUpload, /useRivalCollection/);
  assert.doesNotMatch(csvUpload, /<RivalCollectionCard\b/);

  const section = source('src/components/import/RivalCollectionSection.jsx');
  assert.match(section, /useRivalCollection\(\)/);

  assert.match(source('src/pages/Profile.jsx'), /\{ENABLE_RIVAL_COLLECTION && <IidxBindingSummary \/>\}/);

  const app = source('src/App.jsx');
  assert.match(app, /\{ENABLE_RIVAL_COLLECTION && \(\s*<Route\s+path="\/crawler\/iidx-link"/);
  assert.equal((app.match(/path="\/crawler\/iidx-link"/g) || []).length, 1, 'no ungated copy of the route');
});

test('production builds pass the flag and default it to off', () => {
  const workflow = source('.github/workflows/deploy-frontend.yml');
  assert.match(workflow, /VITE_ENABLE_RIVAL_COLLECTION: \$\{\{ vars\.VITE_ENABLE_RIVAL_COLLECTION \|\| '0' \}\}/);
});
