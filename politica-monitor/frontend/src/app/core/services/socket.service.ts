import { Injectable, signal, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { apiBaseUrl } from './runtime-config';

export interface NewMentionsEvent {
  count: number;
  mentions: any[];
}

export interface AlertEvent {
  type: string;
  rule: any;
  message: string;
  campaignId: string;
}

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  private currentCampaignId: string | null = null;

  readonly connected = signal(false);
  readonly newMentions$ = new Subject<NewMentionsEvent>();
  readonly alert$ = new Subject<AlertEvent>();
  readonly scraperProgress$ = new Subject<any>();

  connect(token: string) {
    if (this.socket?.connected) return;
    // Cloud Functions don't support WebSockets — skip silently if no socket URL
    const socketUrl = apiBaseUrl() || window.location.origin;
    try {
      this.socket = io(socketUrl, {
        auth: { token },
        transports: ['polling'],
        // Mismo motivo que en auth.interceptor: el transporte polling son
        // pedidos XHR normales, y sin este header ngrok free les contesta su
        // pagina de advertencia en vez de dejarlos pasar al backend.
        extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
        // El backend corre en una PC con un tunel que se reinicia solo: con 2
        // intentos, cualquier corte de 10 segundos dejaba el indicador en
        // "Offline" hasta que el usuario recargara la pagina a mano.
        reconnectionAttempts: Infinity,
        reconnectionDelay: 3000,
        reconnectionDelayMax: 30000,
        timeout: 10000,
      });
      this.socket.on('connect', () => this.connected.set(true));
      this.socket.on('connect_error', () => this.connected.set(false));
      this.socket.on('disconnect', () => this.connected.set(false));
      this.socket.on('mentions:new', (data: NewMentionsEvent) => this.newMentions$.next(data));
      this.socket.on('alert', (data: AlertEvent) => this.alert$.next(data));
      this.socket.on('scraper-test:progress', (data: any) => this.scraperProgress$.next(data));
    } catch {
      this.connected.set(false);
    }
  }

  joinCampaign(campaignId: string) {
    if (this.currentCampaignId) {
      this.socket?.emit('leave:campaign', this.currentCampaignId);
    }
    this.currentCampaignId = campaignId;
    this.socket?.emit('join:campaign', campaignId);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
    this.currentCampaignId = null;
  }

  ngOnDestroy() {
    this.disconnect();
  }
}
