import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api',
  withCredentials: true, // ⚠️ CRITICAL: Send cookies with every request
  headers: {
    'Content-Type': 'application/json',
  },
});

// CSRF Token Interceptor - Extract XSRF-TOKEN from cookies and add to headers
apiClient.interceptors.request.use(
  (config) => {
    const csrfToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];

    if (csrfToken) {
      config.headers['X-XSRF-TOKEN'] = csrfToken;
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
