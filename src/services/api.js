import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL?.trim() || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // AI requests (Gemini) can take 8–25s — must be > backend timeout (28s)
  headers: {}
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
    if (isFormData) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (status === 403) {
      console.warn('[API] Forbidden request blocked', {
        url: error.config?.url,
        method: error.config?.method,
        message: error.response?.data?.message || error.message
      });
    }

    return Promise.reject(error);
  }
);

export default api;
