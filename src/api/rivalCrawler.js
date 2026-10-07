import apiClient from './client';

const BINDING_URL = '/crawler/iidx/me';
const JOB_URL = '/crawler/rival/jobs/me';
const REGISTRATION_URL = '/crawler/iidx/bookmarklet/me';

// Axios keeps the request config on its rejection object. For verification that
// config contains the user's cookie, and for registration it contains the
// attemptId and IIDX ID, so reject with a response-only copy.
function withoutRequestConfig(error) {
  const safeError = new Error('내 기록 수집 요청에 실패했습니다.');
  safeError.name = 'RivalCrawlerApiError';
  safeError.code = error?.code;
  safeError.response = error?.response
    ? {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
      }
    : undefined;
  return safeError;
}

async function request(promise) {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    throw withoutRequestConfig(error);
  }
}

export const rivalCrawlerApi = {
  getBinding: ({ signal } = {}) => request(apiClient.get(BINDING_URL, { signal })),
  verify: (cookie, { signal } = {}) =>
    request(apiClient.post(BINDING_URL, { eagateCookie: cookie }, { signal })),
  unlink: ({ signal } = {}) => request(apiClient.delete(BINDING_URL, { signal })),
  getStatus: ({ signal } = {}) => request(apiClient.get(JOB_URL, { signal })),
  enqueue: ({ signal } = {}) => request(apiClient.post(JOB_URL, undefined, { signal })),
  cancel: ({ signal } = {}) => request(apiClient.delete(JOB_URL, { signal })),
  // Bookmarklet registration. The server rejects any extra body key with 400,
  // so each body is rebuilt from named values instead of spreading a caller object.
  startRegistration: ({ signal } = {}) =>
    request(apiClient.post(REGISTRATION_URL, undefined, { signal })),
  getRegistration: ({ signal } = {}) => request(apiClient.get(REGISTRATION_URL, { signal })),
  completeRegistration: (attemptId, iidxId, { signal } = {}) =>
    request(apiClient.post(`${REGISTRATION_URL}/complete`, { attemptId, iidxId }, { signal })),
  cancelRegistration: (attemptId, { signal } = {}) =>
    request(apiClient.delete(REGISTRATION_URL, { data: { attemptId }, signal })),
};

export default rivalCrawlerApi;
