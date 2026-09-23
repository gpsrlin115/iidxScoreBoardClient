import test from 'node:test';
import assert from 'node:assert/strict';
import { isSessionExpiryExempt } from '../src/utils/sessionExpiryExempt.js';

test('provider discovery and CSRF bootstrap are exempt from session-expiry handling', () => {
  assert.equal(isSessionExpiryExempt('/auth/providers'), true);
  assert.equal(isSessionExpiryExempt('/csrf'), true);
});

test('existing anonymous and session-restore endpoints remain exempt', () => {
  assert.equal(isSessionExpiryExempt('/users/me'), true);
  assert.equal(isSessionExpiryExempt('/auth/login'), true);
  assert.equal(isSessionExpiryExempt('/auth/password-reset/confirm'), true);
});

test('protected, related, and malformed paths still trigger session-expiry handling', () => {
  for (const path of [
    '/users/me/login-methods',
    '/auth/google/pending',
    '/auth/google/link/confirm',
    '/scores',
    '/auth/providers/x',
    '/csrf-token',
    undefined,
  ]) {
    assert.equal(isSessionExpiryExempt(path), false, path);
  }
});
