import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTierImageFilename,
  buildTierShareUrl,
  calculateTierProgress,
  createLatestRequestGuard,
  normalizeShareScope,
  publicTierItemsToRows,
  scopeFromSearchParams,
} from '../src/utils/tierShare.js';

test('share scope normalizes invalid query values to stable defaults', () => {
  assert.deepEqual(normalizeShareScope({ level: '9', playStyle: 'xx', mode: 'wide' }), {
    level: 12,
    playStyle: 'SP',
    mode: 'chips',
  });

  assert.deepEqual(scopeFromSearchParams(new URLSearchParams('level=11&playStyle=dp&mode=dense')), {
    level: 11,
    playStyle: 'DP',
    mode: 'dense',
  });
});

test('share URL preserves level, play style and current density mode', () => {
  assert.equal(
    buildTierShareUrl('https://example.com/', 'id/with spaces', {
      level: 10,
      playStyle: 'DP',
      mode: 'dense',
    }),
    'https://example.com/shared/tier-table/id%2Fwith%20spaces?level=10&playStyle=DP&mode=dense'
  );
});

test('image filename removes Windows-invalid characters and includes scope', () => {
  const date = new Date(2026, 7, 27, 9, 5);
  assert.equal(
    buildTierImageFilename('player:/one*', { level: 12, playStyle: 'SP', mode: 'chips' }, date),
    'iidx-tier-player-one-SP-lv12-chips-20260827-0905.png'
  );
});

test('public items use the existing category normalization and tier ordering', () => {
  const rows = publicTierItemsToRows([
    { title: 'Unsorted', difficulty: 'ANOTHER', category: null, tier: null, clearType: 'NO_PLAY' },
    { title: 'B', difficulty: 'ANOTHER', category: '개인차', tier: 'S+', clearType: 'CLEAR' },
    { title: 'A', difficulty: 'ANOTHER', category: '지력', tier: 'S+', clearType: 'HARD_CLEAR' },
  ]);

  assert.deepEqual(rows.map((row) => row.tier), ['地力 S+', '個人差 S+', '未定']);
  assert.deepEqual(calculateTierProgress(rows), { cleared: 2, total: 3, percent: 67 });
});

test('latest request guard rejects a stale response', () => {
  const guard = createLatestRequestGuard();
  const first = guard.next();
  const second = guard.next();

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});
