import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// LLM-backed calls can take up to ~2 minutes on the server.
const LLM_REQUEST = { timeout: 130000 };

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const cfg = error.config || {};
        const status = error.response?.status;

        if (status === 401 && !cfg.url?.includes('/auth/login')) {
          localStorage.removeItem('token');
          window.dispatchEvent(new CustomEvent('auth_logout'));
        }

        const isGet = (cfg.method || 'get').toLowerCase() === 'get';
        if (status === 429 && isGet) {
          cfg.__retryCount = cfg.__retryCount || 0;
        }
        if (status === 429 && isGet && cfg.__retryCount < 3) {
          cfg.__retryCount += 1;
          const retryAfterHeader = error.response?.headers?.['retry-after'];
          const serverDelay = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : null;
          const backoff = serverDelay ?? Math.min(2000 * cfg.__retryCount, 5000);
          await new Promise((r) => setTimeout(r, backoff));
          return this.client(cfg);
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  auth = {
    login: (email, password) => this.client.post('/auth/login', { email, password }),
    getProfile: () => this.client.get('/auth/profile'),
    updateProfile: (data) => this.client.put('/auth/profile', data),
    forgotPassword: (email) => this.client.post('/auth/forgot-password', { email }),
    resetPassword: (token, password) => this.client.post('/auth/reset-password', { token, password }),
    logout: () => this.client.post('/auth/logout'),
  };

  user = {
    changePassword: (currentPassword, newPassword) =>
      this.client.put('/users/change-password', { currentPassword, newPassword }),
    deleteAccount: (password) =>
      this.client.delete('/users/account', { data: { password } }),
    updateSettings: (data) => this.client.put('/users/settings', data),
  };

  emailChange = {
    request: (newEmail) => this.client.post('/users/email-change/request', { newEmail }),
    confirm: (token) => this.client.post('/users/email-change/confirm', { token }),
  };

  syllabus = {
    upload: (formData, config = {}) =>
      this.client.post('/syllabus/upload', formData, {
        ...config,
        headers: { 'Content-Type': 'multipart/form-data', ...(config.headers || {}) },
      }),
    getSyllabus: (id) => this.client.get(`/syllabus/${id}`),
    deleteSyllabus: (id) => this.client.delete(`/syllabus/${id}`),
    reanalyze: (id) => this.client.post(`/syllabus/${id}/analyze`),
  };

  chat = {
    get: (syllabusId) => this.client.get(`/chat/${syllabusId}`),
    start: (syllabusId) => this.client.post(`/chat/${syllabusId}/start`, {}, LLM_REQUEST),
    confirm: (syllabusId, body) => this.client.post(`/chat/${syllabusId}/confirm`, body, LLM_REQUEST),
    cancel: (syllabusId, body) => this.client.post(`/chat/${syllabusId}/cancel`, body, LLM_REQUEST),
    reopen: (syllabusId, issueId, body = {}) =>
      this.client.post(`/chat/${syllabusId}/issues/${issueId}/reopen`, body, LLM_REQUEST),
    sendMessage: (syllabusId, body) => this.client.post(`/chat/${syllabusId}/message`, body, LLM_REQUEST),
    preview: (syllabusId) =>
      this.client.post(`/chat/${syllabusId}/preview`, {}, { ...LLM_REQUEST, responseType: 'blob' }),
    issuePreview: (syllabusId, issueId, selection = null) =>
      this.client.post(
        `/chat/${syllabusId}/issues/${issueId}/preview`,
        selection ? { selection } : {},
        LLM_REQUEST
      ),
    submit: (syllabusId) => this.client.post(`/chat/${syllabusId}/submit`, {}, LLM_REQUEST),
  };

  cabinet = {
    getSyllabi: (params = {}) => this.client.get('/cabinet/syllabi', { params }),
    getMetrics: () => this.client.get('/cabinet/metrics'),
    getUsers: (params = {}) => this.client.get('/cabinet/users', { params }),
    createUser: (data) => this.client.post('/cabinet/users', data),
    listPrograms: () => this.client.get('/cabinet/programs'),
    createProgram: (data) => this.client.post('/cabinet/programs', data),
    updateProgram: (id, data) => this.client.put(`/cabinet/programs/${id}`, data),
    deleteProgram: (id) => this.client.delete(`/cabinet/programs/${id}`),
    updateUser: (id, data) => this.client.patch(`/cabinet/users/${id}`, data),
    resendSubmission: (syllabusId) => this.client.post(`/cabinet/syllabi/${syllabusId}/resend-submission`),
  };

  policies = {
    getAll: (params = {}) => this.client.get('/policies', { params }),
    create: (data) =>
      this.client.post('/policies', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    update: (id, data) =>
      this.client.put(`/policies/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    delete: (id) => this.client.delete(`/policies/${id}`),
    acknowledge: (id) => this.client.post(`/policies/${id}/acknowledge`),
    downloadFile: (id) => this.client.get(`/policies/${id}/download`, { responseType: 'blob' }),
  };

}

const api = new ApiService();
export default api;
