import test from 'node:test';
import assert from 'node:assert/strict';

import { refreshTierAfterAdminSave } from '../src/utils/tierMutationRefresh.js';

test('admin save refreshes the exact tier scope without using its settled cache', () => {
  const calls = [];
  const fetchTierData = (...args) => {
    calls.push(args);
    return Promise.resolve();
  };

  refreshTierAfterAdminSave(fetchTierData, 11, 'DP');

  assert.deepEqual(calls, [[11, 'DP', { force: true }]]);
});
