import test from 'node:test';
import assert from 'node:assert/strict';
import {
  googleAuthError, googlePasswordError, googleUsernameError, googleProtectedRedirect,
  isGoogleCredentialRecheck, isGooglePendingValid, postGoogleWithCsrf,
} from '../src/utils/googleAuth.js';

test('a wrong password recheck does not exempt expired sessions or other auth operations', () => {
  assert.equal(isGoogleCredentialRecheck('/auth/google/start', 'INVALID_CREDENTIALS'), true);
  assert.equal(isGoogleCredentialRecheck('/auth/google/start', 'AUTH_REQUIRED'), false);
  assert.equal(isGoogleCredentialRecheck('/auth/google/start', undefined), false);
  assert.equal(isGoogleCredentialRecheck('/auth/google/start/other', 'INVALID_CREDENTIALS'), false);
  assert.equal(isGoogleCredentialRecheck('/auth/google/link/confirm', 'INVALID_CREDENTIALS'), false);
  assert.equal(isGoogleCredentialRecheck('/auth/google/pending', 'AUTH_REQUIRED'), false);
});

test('pending expiry has its own recovery message and is not treated as session expiry', () => {
  assert.equal(googleAuthError({ response: { status: 410 } }).code, 'FLOW_EXPIRED');
  assert.equal(googleAuthError({ response: { status: 401 } }).code, 'AUTH_REQUIRED');
  assert.notEqual(googleAuthError('FLOW_EXPIRED').message, googleAuthError('AUTH_REQUIRED').message);
});

test('expired profile callbacks retain actionable Google errors after the route guard redirects', () => {
  assert.equal(googleProtectedRedirect('/profile', '?googleError=FLOW_EXPIRED'), '/login?googleError=FLOW_EXPIRED');
  assert.equal(googleProtectedRedirect('/profile', '?google=pending'), '/login?googleError=AUTH_REQUIRED');
  assert.equal(googleProtectedRedirect('/profile', '?googleError=untrusted-value'), '/login?googleError=GOOGLE_FAILED');
  assert.equal(googleProtectedRedirect('/profile', ''), '/login');
  assert.equal(googleProtectedRedirect('/scores', '?googleError=FLOW_EXPIRED'), '/login');
});

test('unknown callback values and raw server messages cannot leak into the UI', () => {
  assert.equal(googleAuthError('__proto__').code, 'GOOGLE_FAILED');
  assert.equal(googleAuthError('constructor').code, 'GOOGLE_FAILED');
  const error = googleAuthError({ response: { status: 500, data: { code: 'UNEXPECTED', message: 'secret@example.com token=secret' } } });
  assert.doesNotMatch(error.message, /secret|token|@example/);
});

test('email conflict gives login/link guidance without naming another account', () => {
  const error = googleAuthError({ response: { status: 409, data: { code: 'EMAIL_CONFLICT', message: 'existing user is other-user' } } });
  assert.equal(error.code, 'EMAIL_CONFLICT');
  assert.match(error.message, /기존 계정.*프로필/);
  assert.doesNotMatch(error.message, /other-user/);
});

test('rate limiting is not displayed as bad Google credentials', () => {
  const error = googleAuthError({ response: { status: 429, data: {} } });
  assert.match(error.message, /요청이 너무 많습니다/);
});

test('a concurrent account conflict explains how to restart without exposing account details', () => {
  const result = googleAuthError({ response: { status: 409, data: { code: 'ACCOUNT_CONFLICT', message: 'duplicate private account' } } });
  assert.equal(result.code, 'ACCOUNT_CONFLICT');
  assert.match(result.message, /새로고침/);
  assert.doesNotMatch(result.message, /private/);
});

test('pending confirmation requires the destination intent and an unexpired server deadline', () => {
  const now = Date.parse('2026-08-31T10:00:00Z');
  const pending = { intent: 'link', email: 'verified@example.com', expiresAt: '2026-08-31T10:05:00Z' };
  assert.equal(isGooglePendingValid(pending, ['link', 'set_password'], now), true);
  assert.equal(isGooglePendingValid(pending, ['signup'], now), false);
  assert.equal(isGooglePendingValid(pending, ['link'], now + 300_000), false);
  assert.equal(isGooglePendingValid({ ...pending, expiresAt: 'not-a-date' }, ['link'], now), false);
  assert.equal(isGooglePendingValid({ ...pending, email: undefined }, ['link'], now), false);
  assert.equal(isGooglePendingValid(null, ['link'], now), false);
});

test('Google username validation matches the trimmed server boundaries', () => {
  assert.notEqual(googleUsernameError('  ab  '), '');
  assert.equal(googleUsernameError('  abc  '), '');
  assert.equal(googleUsernameError('x'.repeat(50)), '');
  assert.notEqual(googleUsernameError('x'.repeat(51)), '');
  assert.notEqual(googleUsernameError('   '), '');
});

test('initial password validation requires the minimum and matching confirmation', () => {
  assert.notEqual(googlePasswordError('short', 'short'), '');
  assert.notEqual(googlePasswordError('long-enough', 'different'), '');
  assert.equal(googlePasswordError('long-enough', 'long-enough'), '');
});

test('Google mutation waits for fresh CSRF bootstrap before sending its body', async () => {
  let resolveBootstrap;
  const calls = [];
  const client = {
    get: (path) => {
      calls.push(['GET', path]);
      return new Promise((resolve) => { resolveBootstrap = resolve; });
    },
    post: async (path, body) => {
      calls.push(['POST', path, body]);
      return { data: { authorizationUrl: 'https://server.example/api/auth/oauth2/authorization/google' } };
    },
  };
  const response = postGoogleWithCsrf(client, '/auth/google/start', { intent: 'link', currentPassword: 'test-password' });
  assert.deepEqual(calls, [['GET', '/csrf']]);
  resolveBootstrap({ data: { token: 'unused-XOR-token' } });
  assert.deepEqual(await response, { authorizationUrl: 'https://server.example/api/auth/oauth2/authorization/google' });
  assert.deepEqual(calls[1], ['POST', '/auth/google/start', { intent: 'link', currentPassword: 'test-password' }]);
});

test('failed CSRF bootstrap prevents the state-changing request', async () => {
  let posted = false;
  const failure = new Error('bootstrap failed');
  const client = {
    get: async () => { throw failure; },
    post: async () => { posted = true; },
  };
  await assert.rejects(postGoogleWithCsrf(client, '/auth/google/signup', { username: 'test-user' }), failure);
  assert.equal(posted, false);
});

test('failed confirmation is returned to the caller and never automatically replayed', async () => {
  let posts = 0;
  const failure = { response: { status: 409, data: { code: 'GOOGLE_ALREADY_LINKED' } } };
  const client = {
    get: async () => ({}),
    post: async () => { posts++; throw failure; },
  };
  await assert.rejects(postGoogleWithCsrf(client, '/auth/google/link/confirm', {}), (error) => error === failure);
  assert.equal(posts, 1);
});
