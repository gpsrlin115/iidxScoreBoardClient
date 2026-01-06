import client from './client';

export const login = async (username, password) => {
  const response = await client.post('/auth/login', { username, password });
  return response.data;
};

export const logout = async () => {
  await client.post('/auth/logout');
};

export const getCurrentUser = async () => {
  const response = await client.get('/users/me');
  return response.data;
};
