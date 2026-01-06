import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api',
  withCredentials: true, // Send cookies (JSESSIONID) with requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach CSRF token from cookie to request header
client.interceptors.request.use(
  (config) => {
    // Read XSRF-TOKEN from cookie
    const csrfToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];

    if (csrfToken) {
      config.headers['X-XSRF-TOKEN'] = csrfToken;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle 401 (Unauthorized)
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login page on unauthorized
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
