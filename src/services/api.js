import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
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
    // Đăng nhập / đăng ký sai trả 401 nhưng KHÔNG phải hết phiên: để trang tự hiện lỗi
    // ("sai mật khẩu"…), không xoá phiên và tải lại /login (tải lại làm mất thông báo lỗi).
    const authForm = /\/auth\/(login|register|google)/.test(String(error.config?.url || ''));
    if ((status === 401 || status === 403) && !authForm) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
