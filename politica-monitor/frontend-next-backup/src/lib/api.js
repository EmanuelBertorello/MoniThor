// src/lib/api.js
import axios from 'axios';
import { auth } from './firebaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function attachToken(config) {
  const token = await auth.currentUser?.getIdToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}

function redirectOn401(err) {
  if (err.response?.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  return Promise.reject(err);
}

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});
api.interceptors.request.use(attachToken);
api.interceptors.response.use((res) => res, redirectOn401);

// Pega directo a la Cloud Function, sin pasar por el rewrite de Firebase
// Hosting — ese rewrite corta requests largas (~60s) con 502 aunque el
// server siga corriendo bien. Solo para endpoints que tardan (scraper-test).
const FUNCTION_URL = process.env.NEXT_PUBLIC_FUNCTION_URL ?? API_URL;
export const apiDirect = axios.create({
  baseURL: `${FUNCTION_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});
apiDirect.interceptors.request.use(attachToken);
apiDirect.interceptors.response.use((res) => res, redirectOn401);

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
};

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const campaignsAPI = {
  list: () => api.get('/campaigns'),
  get: (id) => api.get(`/campaigns/${id}`),
  create: (data) => api.post('/campaigns', data),
  update: (id, data) => api.put(`/campaigns/${id}`, data),
  delete: (id) => api.delete(`/campaigns/${id}`),
};

// ─── Keywords ─────────────────────────────────────────────────────────────────
export const keywordsAPI = {
  list: (campaignId) => api.get('/keywords', { params: { campaignId } }),
  create: (data) => api.post('/keywords', data),
  delete: (id) => api.delete(`/keywords/${id}`),
};

// ─── Mentions ─────────────────────────────────────────────────────────────────
export const mentionsAPI = {
  list: (params) => api.get('/mentions', { params }),
  unreadCount: (campaignId) => api.get('/mentions/unread-count', { params: { campaignId } }),
  delete: (id) => api.delete(`/mentions/${id}`),
};

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsAPI = {
  summary: (campaignId, period) => api.get('/analytics/summary', { params: { campaignId, period } }),
  timeseries: (campaignId, period, interval) =>
    api.get('/analytics/timeseries', { params: { campaignId, period, interval } }),
};

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const alertsAPI = {
  list: (campaignId) => api.get('/alerts', { params: { campaignId } }),
  createRule: (data) => api.post('/alerts/rules', data),
  toggleRule: (id) => api.put(`/alerts/rules/${id}/toggle`),
  markRead: (id) => api.put(`/alerts/${id}/read`),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsAPI = {
  generate: (data) => api.post('/reports/generate', data),
  list: (campaignId) => api.get('/reports', { params: { campaignId } }),
};

// ─── Custom Sources ───────────────────────────────────────────────────────────
export const sourcesAPI = {
  list: (campaignId) => api.get('/sources', { params: { campaignId } }),
  create: (data) => api.post('/sources', data),
  update: (id, data) => api.put(`/sources/${id}`, data),
  delete: (id) => api.delete(`/sources/${id}`),
  test: (id) => api.post(`/sources/${id}/test`),
};

// ─── Social Auth ─────────────────────────────────────────────────────────────
export const socialAuthAPI = {
  status: () => api.get('/social-auth/status'),
  connect: (data) => api.post('/social-auth/connect', data),
  disconnect: (id) => api.delete(`/social-auth/${id}`),
  refresh: (id) => api.post(`/social-auth/refresh/${id}`),
};

// ─── Scraper test (dev/test only, sacar en producción) ──────────────────────
export const scraperTestAPI = {
  run: (data) => api.post('/scraper-test/run', data),
};

export default api;
