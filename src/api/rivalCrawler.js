import apiClient from './client';

const BINDING_URL = '/crawler/iidx/me';
const JOB_URL = '/crawler/rival/jobs/me';

// Axios keeps the request config on its rejection object. For verification that
// config contains the user's cookie, so reject with a response-only copy.
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
};

export default rivalCrawlerApi;
