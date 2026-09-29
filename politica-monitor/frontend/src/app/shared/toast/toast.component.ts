import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="flex items-center gap-3 px-4 py-3 rounded-xl border shadow-card backdrop-blur-sm pointer-events-auto animate-slide-up max-w-sm"
          [class]="toastClass(toast.type)"
        >
          <span class="text-lg flex-shrink-0">{{ toastIcon(toast.type) }}</span>
          <span class="text-sm font-medium flex-1">{{ toast.message }}</span>
          <button
            (click)="toastService.remove(toast.id)"
            class="text-current opacity-50 hover:opacity-100 transition-opacity ml-2 flex-shrink-0"
          >✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  toastClass(type: string): string {
    const map: Record<string, string> = {
      success: 'bg-success/10 border-success/30 text-success',
      error: 'bg-danger/10 border-danger/30 text-danger',
      warning: 'bg-warning/10 border-warning/30 text-warning',
      info: 'bg-info/10 border-info/30 text-info',
    };
    return map[type] ?? map['info'];
  }

  toastIcon(type: string): string {
    const map: Record<string, string> = {
      success: '✓', error: '✕', warning: '⚠', info: 'ℹ',
    };
    return map[type] ?? 'ℹ';
  }
}
