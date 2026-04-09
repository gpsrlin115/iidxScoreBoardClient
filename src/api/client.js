import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api',
  withCredentials: true, // ⚠️ CRITICAL: Send cookies with every request
  // Content-Type은 인터셉터에서 요청 데이터 유형에 따라 자동 설정합니다.
  // FormData → multipart/form-data (boundary 포함, 브라우저/axios 자동 설정)
  // 그 외   → application/json
});

// Request Interceptor - Content-Type 자동 설정 + CSRF 토큰 주입
apiClient.interceptors.request.use(
  (config) => {
    // 1. Content-Type 자동 설정
    //    FormData면 헤더를 삭제 → axios/브라우저가 multipart/form-data; boundary=... 를 자동으로 붙임
    //    그 외 body가 있는 요청이면 application/json 설정
    const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
    if (isFormData) {
      delete config.headers['Content-Type'];
    } else if (!config.headers['Content-Type'] && config.data !== undefined) {
      config.headers['Content-Type'] = 'application/json';
    }

    // 2. CSRF Token - XSRF-TOKEN 쿠키 값을 X-XSRF-TOKEN 헤더에 추가
    const csrfToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];

    if (csrfToken) {
      config.headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - could redirect to login
      console.warn('Unauthorized request:', error.config.url);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
