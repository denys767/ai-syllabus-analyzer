import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor with 429 backoff
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const cfg = error.config || {};
        const status = error.response?.status;

        if (status === 401) {
          localStorage.removeItem('token');
          window.dispatchEvent(new CustomEvent('auth_logout'));
        }

        // Simple 429 retry with exponential backoff, up to 3 attempts
        if (status === 429 && !cfg.__retryCount) cfg.__retryCount = 0;
        if (status === 429 && cfg.__retryCount < 3) {
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

  setAuthToken(token) {
    if (token) {
      this.client.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete this.client.defaults.headers.common.Authorization;
    }
  }

  // Auth endpoints
  auth = {
    login: (email, password) =>
      this.client.post('/auth/login', { email, password }),
    
    register: (userData) =>
      this.client.post('/auth/register', userData),
    
    getProfile: () =>
      this.client.get('/auth/profile'),
    
    updateProfile: (data) =>
      this.client.put('/auth/profile', data),
    
    forgotPassword: (email) =>
      this.client.post('/auth/forgot-password', { email }),
    
    resetPassword: (token, password) =>
      this.client.post('/auth/reset-password', { token, password }),
    
    verifyEmail: (token) =>
      this.client.post('/auth/verify-email', { token }),
    resendVerification: (email) =>
      this.client.post('/auth/resend-verification', { email }),
    
    logout: () =>
      this.client.post('/auth/logout'),
  };

  // Syllabus endpoints
  syllabus = {
    upload: (formData) =>
      this.client.post('/syllabus/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    
    getMySyllabi: (params = {}) =>
      this.client.get('/syllabus/my-syllabi', { params }),
    
    getSyllabus: (id) =>
      this.client.get(`/syllabus/${id}`),
    
    getSyllabusStatus: (id) =>
      this.client.get(`/syllabus/${id}/status`),
    
    updateRecommendation: (syllabusId, recommendationId, data) =>
      this.client.put(`/syllabus/${syllabusId}/recommendations/${recommendationId}`, data),
    
    deleteSyllabus: (id) =>
      this.client.delete(`/syllabus/${id}`),
  };

  // Survey endpoints
  surveys = {
    getAll: (params = {}) =>
      this.client.get('/surveys', { params }),
    
    getSurvey: (id) =>
      this.client.get(`/surveys/${id}`),
    
    submitResponse: (surveyId, data) =>
      this.client.post(`/surveys/${surveyId}/responses`, data),
    
    create: (data) =>
      this.client.post('/surveys', data),
    
    update: (id, data) =>
      this.client.put(`/surveys/${id}`, data),
    
    delete: (id) =>
      this.client.delete(`/surveys/${id}`),
    
    getResponses: (id, params = {}) =>
      this.client.get(`/surveys/${id}/responses`, { params }),
  };

  // AI endpoints
  ai = {
    challenge: (data) =>
      this.client.post('/ai/challenge', data),
    
    generateCases: (data) =>
      this.client.post('/ai/generate-cases', data),
    
    getTeachingMethods: (data) =>
      this.client.post('/ai/teaching-methods', data),
    
    saveIdea: (data) =>
      this.client.post('/ai/save-idea', data),
  };

  // Reports endpoints
  reports = {
    getSyllabusReport: (id) =>
      this.client.get(`/reports/syllabus/${id}`),
    
    getAnalytics: (params = {}) =>
      this.client.get('/reports/analytics', { params }),
    
    exportData: (type, params = {}) =>
      this.client.get(`/reports/export/${type}`, { 
        params,
        responseType: 'blob'
      }),
  };

  // Admin endpoints
  admin = {
    getUsers: (params = {}) =>
      this.client.get('/admin/users', { params }),
    
    getUser: (id) =>
      this.client.get(`/admin/users/${id}`),
    
    updateUser: (id, data) =>
      this.client.put(`/admin/users/${id}`, data),
    
    deleteUser: (id) =>
      this.client.delete(`/admin/users/${id}`),
    
    bulkUserAction: (data) =>
      this.client.post('/admin/users/bulk-action', data),
    
    getStatistics: (params = {}) =>
      this.client.get('/admin/statistics', { params }),
    
    getAuditLogs: (params = {}) =>
      this.client.get('/admin/audit-logs', { params }),
    
    getSystemHealth: () =>
      this.client.get('/admin/health'),
  };

  // Generic methods
  get(url, config = {}) {
    return this.client.get(url, config);
  }

  post(url, data = {}, config = {}) {
    return this.client.post(url, data, config);
  }

  put(url, data = {}, config = {}) {
    return this.client.put(url, data, config);
  }

  delete(url, config = {}) {
    return this.client.delete(url, config);
  }
}

const api = new ApiService();
export default api;
