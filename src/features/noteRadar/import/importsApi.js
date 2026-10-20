import apiClient from '../../../api/client';
import { safeImportFailure } from './importErrors.js';

const PATH = '/note-radar/imports';
const READ_TIMEOUT_MS = 10000;
const WRITE_TIMEOUT_MS = 20000;

async function request(promise) {
  try {
    return (await promise).data;
  } catch (error) {
    throw safeImportFailure(error);
  }
}

export const importsApi = {
  start: ({ signal } = {}) => request(apiClient.post(PATH, undefined, { signal, timeout: WRITE_TIMEOUT_MS })),
  current: ({ signal } = {}) => request(apiClient.get(`${PATH}/current`, { signal, timeout: READ_TIMEOUT_MS })),
  complete: (attemptId, payload, { signal } = {}) => request(apiClient.post(`${PATH}/complete`,
    { attemptId, payload }, { signal, timeout: WRITE_TIMEOUT_MS })),
};
