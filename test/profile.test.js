import test from 'node:test';
import assert from 'node:assert/strict';

import { createProfileApi } from '../src/api/profileClient.js';
import { profileError } from '../src/utils/profileError.js';
import {
  formatIidxId,
  iidxIdError,
  nicknameError,
  normalizeIidxId,
  normalizeNickname,
} from '../src/utils/profile.js';

test('nickname normalization matches the profile contract before saving', () => {
  assert.equal(normalizeNickname('  ＤＪ　Kim  '), 'DJ Kim');
  assert.equal(nicknameError('A'), '닉네임은 2~50자로 입력해주세요.');
  assert.match(nicknameError('DJ\nKim'), /줄바꿈/);
  assert.equal(nicknameError('DJ Kim'), '');
});

test('IIDX-ID is formatted for display and normalized to eight digits for requests', () => {
  assert.equal(formatIidxId('12345678'), '1234-5678');
  assert.equal(formatIidxId('1234-5678'), '1234-5678');
  assert.equal(normalizeIidxId('1234-5678'), '12345678');
  assert.equal(normalizeIidxId(''), null);
  assert.match(iidxIdError('1234-567'), /8자리/);
});

test('profile API sends the agreed profile and password contracts', async () => {
  const calls = [];
  const client = {
    put: async (path, body) => {
      calls.push({ method: 'put', path, body });
      return { data: { id: 1, nickname: body.nickname, iidxId: '1234-5678' } };
    },
    post: async (path, body) => {
      calls.push({ method: 'post', path, body });
      return { data: undefined };
    },
    delete: async () => ({ data: undefined }),
  };
  const api = createProfileApi(client);

  const user = await api.updateProfile({ nickname: '  ＤＪ　Kim ', iidxId: '1234-5678' });
  await api.changePassword({ currentPassword: 'old-password', newPassword: 'new-password' });

  assert.deepEqual(user, { id: 1, nickname: 'DJ Kim', iidxId: '1234-5678' });
  assert.deepEqual(calls, [
    { method: 'put', path: '/users/me/profile', body: { nickname: 'DJ Kim', iidxId: '12345678' } },
    { method: 'post', path: '/users/me/password', body: { currentPassword: 'old-password', newPassword: 'new-password' } },
  ]);
});

test('profile avatar API keeps the existing multipart upload and delete routes', async () => {
  const calls = [];
  const client = {
    post: async (path, body) => {
      calls.push({ method: 'post', path, body });
      return { data: { avatarUrl: '/uploads/avatars/1.webp' } };
    },
    delete: async (path) => {
      calls.push({ method: 'delete', path });
      return { data: undefined };
    },
  };
  const api = createProfileApi(client);
  const file = new Blob(['avatar'], { type: 'image/webp' });

  const result = await api.uploadAvatar(file);
  await api.deleteAvatar();

  assert.equal(result.avatarUrl, '/uploads/avatars/1.webp');
  assert.equal(calls[0].path, '/users/me/avatar');
  assert.equal(calls[0].body.get('file').type, 'image/webp');
  assert.deepEqual(calls[1], { method: 'delete', path: '/users/me/avatar' });
});

test('profile error codes remain field-specific for the form', () => {
  const duplicate = profileError({ response: { status: 409, data: { code: 'NICKNAME_TAKEN' } } });
  const rateLimited = profileError({ response: { status: 429, data: {} } });

  assert.equal(duplicate.code, 'NICKNAME_TAKEN');
  assert.match(duplicate.message, /사용 중/);
  assert.equal(rateLimited.code, 'RATE_LIMITED');
});
