import { Component, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/services/auth.service';
import { SocketService } from './core/services/socket.service';
import { ToastComponent } from './shared/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, ToastComponent],
  template: `
    @if (auth.loading()) {
      <div class="min-h-screen bg-surface flex items-center justify-center">
        <div class="flex flex-col items-center gap-4">
          <div class="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          <span class="text-muted text-sm">Iniciando...</span>
        </div>
      </div>
    } @else {
      <router-outlet />
      <app-toast />
    }
  `,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private socket = inject(SocketService);

  constructor() {
    effect(() => {
      const user = this.auth.appUser();
      if (user) {
        this.auth.getIdToken().then(token => {
          if (token) this.socket.connect(token);
        });
      } else {
        this.socket.disconnect();
      }
    }, { allowSignalWrites: true });
  }
}
