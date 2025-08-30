//   import axios from 'axios';

// // Create axios instance with base configuration
// const api = axios.create({
//   baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
//   timeout: 30000,
//   headers: {
//     'Content-Type': 'application/json',
//   },
// });

// // Add auth token to requests
// api.interceptors.request.use(
//   (config) => {
//     const token = localStorage.getItem('token');
//     if (token) {
//       config.headers.Authorization = `Bearer ${token}`;
//     }
//     return config;
//   },
//   (error) => {
//     return Promise.reject(error);
//   }
// );

// // Handle responses and errors
// api.interceptors.response.use(
//   (response) => response,
//   (error) => {
//     if (error.response?.status === 401) {
//       // Token expired or invalid
//       localStorage.removeItem('token');
//       localStorage.removeItem('user');
//       window.location.href = '/login';
//     }
//     return Promise.reject(error);
//   }
// );

// export const apiService = {
//   // Generic methods
//   get: (url, config = {}) => api.get(url, config),
//   post: (url, data = {}, config = {}) => api.post(url, data, config),
//   put: (url, data = {}, config = {}) => api.put(url, data, config),
//   patch: (url, data = {}, config = {}) => api.patch(url, data, config),
//   delete: (url, config = {}) => api.delete(url, config),

//   // Auth methods
//   auth: {
//     login: (credentials) => api.post('/auth/login', credentials),
//     register: (userData) => api.post('/auth/register', userData),
//     logout: () => api.post('/auth/logout'),
//     getProfile: () => api.get('/auth/profile'),
//     updateProfile: (data) => api.put('/auth/profile', data),
//     forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
//     resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
//     verifyEmail: (token) => api.post('/auth/verify-email', { token }),
//   },

//   // Syllabus methods
//   syllabi: {
//     getAll: (params = {}) => api.get('/syllabi', { params }),
//     getById: (id) => api.get(`/syllabi/${id}`),
//     upload: (formData) => api.post('/syllabi/upload', formData, {
//       headers: { 'Content-Type': 'multipart/form-data' }
//     }),
//     update: (id, data) => api.put(`/syllabi/${id}`, data),
//     delete: (id) => api.delete(`/syllabi/${id}`),
//     analyze: (id) => api.post(`/syllabi/${id}/analyze`),
//     download: (id) => api.get(`/syllabi/${id}/download`, { responseType: 'blob' }),
//     getAnalysis: (id) => api.get(`/syllabi/${id}/analysis`),
//   },

//   // Survey methods
//   surveys: {
//     getAll: (params = {}) => api.get('/surveys', { params }),
//     getById: (id) => api.get(`/surveys/${id}`),
//     create: (data) => api.post('/surveys', data),
//     update: (id, data) => api.put(`/surveys/${id}`, data),
//     delete: (id) => api.delete(`/surveys/${id}`),
//     submit: (id, responses) => api.post(`/surveys/${id}/responses`, { responses }),
//     getResponses: (id) => api.get(`/surveys/${id}/responses`),
//     getPublic: (id) => api.get(`/surveys/${id}/public`),
//   },

//   // AI methods
//   ai: {
//     challenge: (syllabusId, message) => api.post('/ai/challenge', { syllabusId, message }),
//     getRecommendations: (syllabusId) => api.get(`/ai/recommendations/${syllabusId}`),
//     acceptRecommendation: (recommendationId) => api.post(`/ai/recommendations/${recommendationId}/accept`),
//     rejectRecommendation: (recommendationId) => api.post(`/ai/recommendations/${recommendationId}/reject`),
//     savePracticalIdea: (data) => api.post('/ai/practical-ideas', data),
//     getPracticalIdeas: (syllabusId) => api.get(`/ai/practical-ideas/${syllabusId}`),
//   },

//   // Reports methods
//   reports: {
//     getUserStats: () => api.get('/reports/user-stats'),
//     getSyllabusReport: (id) => api.get(`/reports/syllabus/${id}`),
//     exportReport: (id, format) => api.get(`/reports/syllabus/${id}/export?format=${format}`, {
//       responseType: 'blob'
//     }),
//     getSystemStats: () => api.get('/reports/system-stats'),
//     getUserActivity: (params = {}) => api.get('/reports/user-activity', { params }),
//   },

//   // Admin methods
//   admin: {
//     getUsers: (params = {}) => api.get('/admin/users', { params }),
//     getUserById: (id) => api.get(`/admin/users/${id}`),
//     createUser: (data) => api.post('/admin/users', data),
//     updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
//     deleteUser: (id) => api.delete(`/admin/users/${id}`),
//     toggleUserStatus: (id) => api.patch(`/admin/users/${id}/toggle-status`),
    
//     getDashboardStats: () => api.get('/admin/dashboard-stats'),
//     getAnalytics: (params = {}) => api.get('/admin/analytics', { params }),
    
//     getSurveys: (params = {}) => api.get('/admin/surveys', { params }),
//     createSurvey: (data) => api.post('/admin/surveys', data),
//     updateSurvey: (id, data) => api.put(`/admin/surveys/${id}`, data),
//     deleteSurvey: (id) => api.delete(`/surveys/${id}`),
//     publishSurvey: (id) => api.patch(`/admin/surveys/${id}/publish`),
//     unpublishSurvey: (id) => api.patch(`/admin/surveys/${id}/unpublish`),
//   },

//   // Users methods
//   users: {
//     getStats: () => api.get('/users/stats'),
//     updateSettings: (data) => api.put('/users/settings', data),
//     changePassword: (data) => api.put('/users/change-password', data),
//     deleteAccount: () => api.delete('/users/account'),
//   },
// };

// export default apiService;
