import apiClient from './client';
import { authApi } from './auth';
import { useAuthStore } from '../store/authStore';
import { postGoogleWithCsrf } from '../utils/googleAuth';

export const googleAuthApi = {
  providers: async () => (await apiClient.get('/auth/providers')).data,
  pending: async () => (await apiClient.get('/auth/google/pending')).data,
  loginMethods: async () => (await apiClient.get('/users/me/login-methods')).data,
  start: (intent, currentPassword) => postGoogleWithCsrf(apiClient, '/auth/google/start', {
    intent, ...(currentPassword === undefined ? {} : { currentPassword }),
  }),
  signup: (username) => postGoogleWithCsrf(apiClient, '/auth/google/signup', { username }),
  confirmLink: () => postGoogleWithCsrf(apiClient, '/auth/google/link/confirm', {}),
  setInitialPassword: (newPassword) => postGoogleWithCsrf(apiClient, '/auth/password/initial', { newPassword }),
};

export async function refreshGoogleSession() {
  try {
    const user = await authApi.getCurrentUser();
    useAuthStore.getState().setUser(user);
    return user;
  } catch (error) {
    if (error?.response?.status === 401) useAuthStore.getState().logout();
    throw error;
  }
}
