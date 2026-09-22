import { normalizeIidxId, normalizeNickname } from '../utils/profile.js';

/**
 * Browser-independent profile request factory.  Keeping this contract free
 * of Axios setup lets the Node test suite exercise request shapes with a
 * small fake client while profile.js owns the real browser client binding.
 */
export function createProfileApi(client) {
  return {
    updateProfile: async ({ nickname, iidxId }) => {
      const response = await client.put('/users/me/profile', {
        nickname: normalizeNickname(nickname),
        iidxId: normalizeIidxId(iidxId),
      });
      return response.data;
    },

    changePassword: async ({ currentPassword, newPassword }) => {
      await client.post('/users/me/password', { currentPassword, newPassword });
    },

    uploadAvatar: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await client.post('/users/me/avatar', formData);
      return response.data;
    },

    deleteAvatar: async () => {
      await client.delete('/users/me/avatar');
    },
  };
}
