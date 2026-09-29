import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { apiBaseUrl } from './runtime-config';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  // getter y no propiedad: la URL se resuelve en cada llamada, asi el valor
  // que trae config.json manda sobre el del build.
  private get base() { return `${apiBaseUrl()}/api`; }

  // ─── Auth ───────────────────────────────────────────────────────────────────
  register(data: { name: string }) {
    return this.http.post<any>(`${this.base}/auth/register`, data);
  }
  me() {
    return this.http.get<any>(`${this.base}/auth/me`);
  }
  updateProfile(data: { name: string }) {
    return this.http.put<any>(`${this.base}/auth/profile`, data);
  }

  // ─── Campaigns ──────────────────────────────────────────────────────────────
  getCampaigns() {
    return this.http.get<any>(`${this.base}/campaigns`).pipe(map(r => r.campaigns ?? r));
  }
  getCampaign(id: string) {
    return this.http.get<any>(`${this.base}/campaigns/${id}`).pipe(map(r => r.campaign ?? r));
  }
  createCampaign(data: any) {
    return this.http.post<any>(`${this.base}/campaigns`, data);
  }
  updateCampaign(id: string, data: any) {
    return this.http.put<any>(`${this.base}/campaigns/${id}`, data);
  }
  deleteCampaign(id: string) {
    return this.http.delete<any>(`${this.base}/campaigns/${id}`);
  }

  // ─── Keywords ───────────────────────────────────────────────────────────────
  // includeInactive: el panel de keywords necesita ver las desactivadas para
  // poder reactivarlas; el resto del front solo quiere las activas.
  getKeywords(campaignId: string, includeInactive = false) {
    const params: Record<string, string> = { campaignId };
    if (includeInactive) params['includeInactive'] = 'true';
    return this.http.get<any>(`${this.base}/keywords`, { params }).pipe(map(r => r.keywords ?? r));
  }
  createKeyword(data: any) {
    return this.http.post<any>(`${this.base}/keywords`, data);
  }
  updateKeyword(id: string, data: any) {
    return this.http.put<any>(`${this.base}/keywords/${id}`, data);
  }
  deleteKeyword(id: string) {
    return this.http.delete<any>(`${this.base}/keywords/${id}`);
  }

  // ─── Mentions ───────────────────────────────────────────────────────────────
  getMentions(params: Record<string, any>) {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null) httpParams = httpParams.set(k, String(v)); });
    return this.http.get<any>(`${this.base}/mentions`, { params: httpParams });
  }
  getUnreadCount(campaignId: string) {
    return this.http.get<any>(`${this.base}/mentions/unread-count`, { params: { campaignId } });
  }
  deleteMention(id: string) {
    return this.http.delete<any>(`${this.base}/mentions/${id}`);
  }

  // ─── Analytics ──────────────────────────────────────────────────────────────
  getAnalyticsSummary(campaignId: string, period: string) {
    return this.http.get<any>(`${this.base}/analytics/summary`, { params: { campaignId, period } });
  }
  getTimeseries(campaignId: string, period: string, interval: string) {
    return this.http.get<any>(`${this.base}/analytics/timeseries`, { params: { campaignId, period, interval } });
  }

  // ─── Alerts ─────────────────────────────────────────────────────────────────
  getAlerts(campaignId: string) {
    return this.http.get<any>(`${this.base}/alerts`, { params: { campaignId } });
  }
  createAlertRule(data: any) {
    return this.http.post<any>(`${this.base}/alerts/rules`, data);
  }
  toggleAlertRule(id: string) {
    return this.http.put<any>(`${this.base}/alerts/rules/${id}/toggle`, {});
  }
  markAlertRead(id: string) {
    return this.http.put<any>(`${this.base}/alerts/${id}/read`, {});
  }

  // ─── Reports ────────────────────────────────────────────────────────────────
  generateReport(data: any) {
    return this.http.post<any>(`${this.base}/reports/generate`, data).pipe(map(r => r.data ?? r));
  }
  getReports(campaignId: string) {
    return this.http.get<any>(`${this.base}/reports`, { params: { campaignId } }).pipe(map(r => r.reports ?? r));
  }
  deleteReport(id: string) {
    return this.http.delete<any>(`${this.base}/reports/${id}`);
  }

  // ─── Sources ────────────────────────────────────────────────────────────────
  getSources(campaignId: string) {
    return this.http.get<any>(`${this.base}/sources`, { params: { campaignId } }).pipe(map(r => r.sources ?? r));
  }
  createSource(data: any) {
    return this.http.post<any>(`${this.base}/sources`, data);
  }
  updateSource(id: string, data: any) {
    return this.http.put<any>(`${this.base}/sources/${id}`, data);
  }
  deleteSource(id: string) {
    return this.http.delete<any>(`${this.base}/sources/${id}`);
  }
  testSource(id: string) {
    return this.http.post<any>(`${this.base}/sources/${id}/test`, {});
  }

  // ─── Users (admin) ──────────────────────────────────────────────────────────
  getUsers() {
    return this.http.get<any>(`${this.base}/users`).pipe(map(r => r.users ?? r));
  }
  createUser(data: any) {
    return this.http.post<any>(`${this.base}/users`, data);
  }
  updateUser(id: string, data: any) {
    return this.http.put<any>(`${this.base}/users/${id}`, data);
  }
  deleteUser(id: string) {
    return this.http.delete<any>(`${this.base}/users/${id}`);
  }

  // ─── Analyzer ───────────────────────────────────────────────────────────────
  analyzeUrl(url: string) {
    return this.http.post<any>(`${this.base}/analyzer/analyze`, { url });
  }

  // ─── Scraper test ───────────────────────────────────────────────────────────
  // Una corrida de prueba puede tardar varios minutos. El rewrite de Firebase
  // Hosting corta a los ~60s con 502 aunque la Cloud Function siga trabajando,
  // así que este POST va directo a la función cuando hay una URL configurada.
  runScraperTest(data: any) {
    // functionUrl ya apunta a la funcion con su /api incluido.
    const base = environment.functionUrl || this.base;
    return this.http.post<any>(`${base}/scraper-test/run`, data);
  }
  getScraperTestStatus(runId: string) {
    return this.http.get<any>(`${this.base}/scraper-test/status`, { params: { runId } });
  }
  getScraperTestHistory(campaignId: string) {
    return this.http.get<any>(`${this.base}/scraper-test/history`, { params: { campaignId } })
      .pipe(map(r => r.runs ?? r));
  }

  // ─── Usuarios demo (admin) ──────────────────────────────────────────────────
  createDemoUser(data: any) {
    return this.http.post<any>(`${this.base}/users/demo`, data);
  }
  cleanupDemoUsers() {
    return this.http.delete<any>(`${this.base}/users/cleanup-demos`);
  }
}
