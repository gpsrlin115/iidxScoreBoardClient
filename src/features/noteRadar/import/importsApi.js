import apiClient from '../../../api/client';

const PATH = '/note-radar/imports';
const READ_TIMEOUT_MS = 10000;
const WRITE_TIMEOUT_MS = 20000;

async function request(promise) {
  try {
    return (await promise).data;
  } catch (error) {
    // Do not keep Axios request data containing the one-shot import nonce.
    const safe = new Error('노트레이더 가져오기 요청에 실패했습니다.');
    safe.code = error?.response?.data?.code ?? error?.code;
    safe.status = error?.response?.status;
    throw safe;
  }
}

export const importsApi = {
  start: ({ signal } = {}) => request(apiClient.post(PATH, undefined, { signal, timeout: WRITE_TIMEOUT_MS })),
  current: ({ signal } = {}) => request(apiClient.get(`${PATH}/current`, { signal, timeout: READ_TIMEOUT_MS })),
  complete: (attemptId, payload, { signal } = {}) => request(apiClient.post(`${PATH}/complete`,
    { attemptId, payload }, { signal, timeout: WRITE_TIMEOUT_MS })),
};
