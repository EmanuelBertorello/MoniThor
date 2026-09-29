import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  private add(type: Toast['type'], message: string) {
    const id = Math.random().toString(36).slice(2);
    this.toasts.update(t => [...t, { id, type, message }]);
    setTimeout(() => this.remove(id), 4000);
  }

  remove(id: string) {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }

  success(msg: string) { this.add('success', msg); }
  error(msg: string) { this.add('error', msg); }
  warning(msg: string) { this.add('warning', msg); }
  info(msg: string) { this.add('info', msg); }
}
