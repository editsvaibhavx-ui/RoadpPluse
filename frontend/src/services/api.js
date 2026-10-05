import axios from 'axios';

// Detect if running in local browser environment vs deployed cloud domain
const isBrowser = typeof window !== 'undefined';
const isLocalhost =
  isBrowser &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0');

// Environment variable with safe fallback
const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim();

export const isBackendConfigured = Boolean(rawApiUrl) || isLocalhost;

export const API_BASE_URL = rawApiUrl
  ? rawApiUrl.replace(/\/+$/, '')
  : isLocalhost
    ? (window.location.port === '8000' ? '' : 'http://localhost:8000')
    : '';

export const resolveMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${cleanPath}`;
  }
  return cleanPath;
};

// Global reactive listener for backend reachability
let backendStatusListeners = [];
let currentBackendStatus = {
  isReachable: isBackendConfigured,
  message: isBackendConfigured ? '' : 'VITE_API_URL is not configured in Vercel settings.',
  url: API_BASE_URL || (isBrowser ? window.location.origin : ''),
  lastChecked: null,
};

export const getBackendStatus = () => currentBackendStatus;

export const subscribeBackendStatus = (callback) => {
  backendStatusListeners.push(callback);
  callback(currentBackendStatus);
  return () => {
    backendStatusListeners = backendStatusListeners.filter((cb) => cb !== callback);
  };
};

export const notifyBackendStatus = (isReachable, message = '') => {
  currentBackendStatus = {
    isReachable,
    message,
    url: API_BASE_URL || (isBrowser ? window.location.origin : ''),
    lastChecked: new Date(),
  };
  backendStatusListeners.forEach((cb) => {
    try {
      cb(currentBackendStatus);
    } catch (e) {
      console.error('Error in backend status subscriber:', e);
    }
  });
};

export const checkBackendHealth = async () => {
  const healthUrl = API_BASE_URL ? `${API_BASE_URL}/health` : '/health';
  try {
    const res = await axios.get(healthUrl, { timeout: 6000 });
    if (
      typeof res.data === 'string' &&
      (res.data.trim().startsWith('<!DOCTYPE') ||
        res.data.trim().startsWith('<html') ||
        res.data.trim().startsWith('<!doctype'))
    ) {
      notifyBackendStatus(false, 'API returned HTML instead of JSON. Set VITE_API_URL to your Render backend.');
      return false;
    }
    notifyBackendStatus(true, '');
    return true;
  } catch (err) {
    notifyBackendStatus(false, err.message || 'Backend connection failed.');
    return false;
  }
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

// Request interceptor to attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('roadpulse_token') || localStorage.getItem('urbansense_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle HTML returns and connection errors
api.interceptors.response.use(
  (response) => {
    // Detect if SPA rewrite caught missing /api and returned index.html
    if (
      response.data &&
      typeof response.data === 'string' &&
      (response.data.trim().startsWith('<!DOCTYPE') ||
        response.data.trim().startsWith('<html') ||
        response.data.trim().startsWith('<!doctype'))
    ) {
      const err = new Error(
        `Backend Unreachable: API endpoint returned HTML. If you deployed on Vercel, please set VITE_API_URL in your Vercel Project Settings to your deployed backend URL.`
      );
      err.isBackendUnreachable = true;
      err.response = response;
      notifyBackendStatus(false, err.message);
      return Promise.reject(err);
    }

    notifyBackendStatus(true, '');
    return response;
  },
  (error) => {
    // 401 handling
    if (error.response && error.response.status === 401) {
      if (!error.config.url.includes('/api/auth/login') && !error.config.url.includes('/api/auth/register')) {
        localStorage.removeItem('roadpulse_token');
        localStorage.removeItem('roadpulse_user');
        localStorage.removeItem('urbansense_token');
        localStorage.removeItem('urbansense_user');
      }
    }

    // Network error / Connection refused / 502 / 503 / 504
    if (!error.response || [502, 503, 504].includes(error.response?.status)) {
      error.isBackendUnreachable = true;
      const msg = !error.response
        ? 'Cannot reach the backend API server. Verify VITE_API_URL and that your backend is running.'
        : `Backend returned HTTP ${error.response.status} (Service Unavailable).`;
      notifyBackendStatus(false, msg);
    }

    return Promise.reject(error);
  }
);

export const authService = {
  login: async (username, password) => {
    const res = await api.post('/api/auth/login', { username, password });
    localStorage.setItem('roadpulse_token', res.data.access_token);
    localStorage.setItem('roadpulse_user', JSON.stringify(res.data.user));
    return res.data;
  },
  register: async (data) => {
    const res = await api.post('/api/auth/register', data);
    localStorage.setItem('roadpulse_token', res.data.access_token);
    localStorage.setItem('roadpulse_user', JSON.stringify(res.data.user));
    return res.data;
  },
  logout: () => {
    localStorage.removeItem('roadpulse_token');
    localStorage.removeItem('roadpulse_user');
    localStorage.removeItem('urbansense_token');
    localStorage.removeItem('urbansense_user');
  },
  getCurrentUser: () => {
    try {
      const userStr = localStorage.getItem('roadpulse_user') || localStorage.getItem('urbansense_user');
      if (userStr) return JSON.parse(userStr);
    } catch {
      // fallback
    }
    const defaultUser = {
      id: 1,
      username: 'admin',
      full_name: 'Municipal Administrator',
      role: 'admin',
      department: 'Pune Road Infrastructure & Transit Wing',
    };
    try {
      localStorage.setItem('roadpulse_user', JSON.stringify(defaultUser));
    } catch {
      // ignore
    }
    return defaultUser;
  }
};

export const sessionService = {
  createSession: (data) => api.post('/api/sessions', data),
  getSessions: () => api.get('/api/sessions'),
  getSession: (id) => api.get(`/api/sessions/${id}`),
  deleteSession: (id) => api.delete(`/api/sessions/${id}`),
  appendGPS: (id, points) => api.post(`/api/sessions/${id}/gps`, { points }),
  insertDetections: (id, detections) => api.post(`/api/sessions/${id}/detections`, { detections }),
  updateStep: (id, stepNo, data) => api.post(`/api/sessions/${id}/steps/${stepNo}`, data),
  processVideo: (id, data) => api.post(`/api/sessions/${id}/process-video`, data),
  runClustering: (id, params = {}) => api.post(`/api/sessions/${id}/cluster`, params),
  getSessionDetections: (id) => api.get(`/api/sessions/${id}/detections`),
  getSessionIncidents: (id) => api.get(`/api/sessions/${id}/incidents`),
  getExportUrl: (id, format = 'json') => `${api.defaults.baseURL || ''}/api/sessions/${id}/export?format=${format}`,
};

export const busService = {
  getBuses: () => api.get('/api/buses'),
  createBus: (data) => api.post('/api/buses', data),
  updateBus: (id, data) => api.put(`/api/buses/${id}`, data),
  deleteBus: (id) => api.delete(`/api/buses/${id}`),
};

export const routeService = {
  getRoutes: () => api.get('/api/routes'),
  createRoute: (data) => api.post('/api/routes', data),
  getRoute: (id) => api.get(`/api/routes/${id}`),
};

export const videoService = {
  getStatus: () => api.get('/api/videos/status'),
  getDemoVideoInfo: () => api.get('/api/videos/demo-video'),
  uploadVideo: (formData) => api.post('/api/videos/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  processVideo: (formData) => api.post('/api/videos/process', formData),
  startDemo: () => api.post('/api/videos/demo/start'),
  detectFrame: (formData) => api.post('/api/videos/detect-frame', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
};

export const incidentService = {
  getIncidents: (filters = {}) => api.get('/api/incidents', { params: filters }),
  getIncidentDetail: (id) => api.get(`/api/incidents/${id}`),
  updateIncident: (id, data) => api.put(`/api/incidents/${id}`, data),
  verifyIncident: (id, data) => api.post(`/api/incidents/${id}/verify`, data),
  assignIncident: (id, data) => api.post(`/api/incidents/${id}/assign`, data),
  resolveIncident: (id, data) => api.post(`/api/incidents/${id}/resolve`, data),
};

export const detectionService = {
  getDetections: (params = {}) => api.get('/api/detections', { params }),
};

export const analyticsService = {
  getAnalytics: () => api.get('/api/analytics'),
};

export const notificationService = {
  getNotifications: () => api.get('/api/notifications'),
  markRead: (id) => api.post(`/api/notifications/${id}/read`),
  clearAll: () => api.post('/api/notifications/clear'),
};

export const adminService = {
  getUsers: () => api.get('/api/admin/users'),
  createUser: (data) => api.post('/api/admin/users', data),
  deleteUser: (id) => api.delete(`/api/admin/users/${id}`),
  getSettings: () => api.get('/api/admin/settings'),
  updateSettings: (data) => api.post('/api/admin/settings', data),
  resetDatabase: () => api.post('/api/admin/reset-database'),
};

export default api;
