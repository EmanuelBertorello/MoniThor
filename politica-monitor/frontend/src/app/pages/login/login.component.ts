import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-surface flex">
      <!-- Left panel -->
      <div class="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
        style="background: linear-gradient(135deg, #0a0a18 0%, #0f0f2a 50%, #0a0a18 100%);">
        <!-- Grid pattern -->
        <div class="absolute inset-0 opacity-10"
          style="background-image: linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px); background-size: 40px 40px;">
        </div>
        <!-- Glow orbs -->
        <div class="absolute top-1/4 left-1/3 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute bottom-1/3 right-1/4 w-48 h-48 bg-accent/15 rounded-full blur-3xl pointer-events-none"></div>

        <div class="relative z-10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold shadow-glow-md">M</div>
            <span class="text-xl font-bold text-slate-100">Monitor Político</span>
          </div>
        </div>

        <div class="relative z-10 space-y-8">
          <div>
            <h1 class="text-4xl font-bold text-slate-100 leading-tight">
              Inteligencia política<br/>
              <span class="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">en tiempo real</span>
            </h1>
            <p class="mt-4 text-slate-400 text-lg leading-relaxed">
              Monitoreo de menciones, análisis de sentimiento y alertas automáticas para campañas políticas.
            </p>
          </div>

          <div class="grid grid-cols-3 gap-4">
            @for (stat of stats; track stat.label) {
              <div class="card p-4 text-center">
                <div class="text-2xl font-bold text-primary">{{ stat.value }}</div>
                <div class="text-xs text-muted mt-1">{{ stat.label }}</div>
              </div>
            }
          </div>
        </div>

        <div class="relative z-10 text-xs text-muted">
          © 2025 Monitor Político 2.0
        </div>
      </div>

      <!-- Right panel -->
      <div class="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div class="w-full max-w-md">
          <!-- Mobile logo -->
          <div class="lg:hidden flex items-center gap-3 mb-8">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold shadow-glow-md">M</div>
            <span class="text-xl font-bold text-slate-100">Monitor Político</span>
          </div>

          <div class="card p-6 sm:p-8 animate-slide-up">
            <div class="mb-8">
              <h2 class="text-xl sm:text-2xl font-bold text-slate-100">Iniciar sesión</h2>
              <p class="text-muted mt-1">Accedé a tu panel de monitoreo</p>
            </div>

            <form (ngSubmit)="onSubmit()" #f="ngForm" class="space-y-5">
              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  name="email"
                  [(ngModel)]="email"
                  required
                  class="input"
                  placeholder="tu@email.com"
                  autocomplete="email"
                >
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Contraseña</label>
                <div class="relative">
                  <input
                    [type]="showPassword() ? 'text' : 'password'"
                    name="password"
                    [(ngModel)]="password"
                    required
                    class="input pr-10"
                    placeholder="••••••••"
                    autocomplete="current-password"
                  >
                  <button
                    type="button"
                    (click)="togglePassword()"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-slate-300 transition-colors"
                  >
                    {{ showPassword() ? '👁' : '○' }}
                  </button>
                </div>
              </div>

              @if (errorMsg()) {
                <div class="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-danger text-sm animate-fade-in">
                  {{ errorMsg() }}
                </div>
              }

              <button
                type="submit"
                class="btn-primary w-full py-3 text-base"
                [disabled]="loading()"
              >
                @if (loading()) {
                  <span class="flex items-center justify-center gap-2">
                    <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Ingresando...
                  </span>
                } @else {
                  Ingresar
                }
              </button>
            </form>

            <div class="mt-6 pt-6 border-t border-surface-border">
              <p class="text-xs text-muted text-center mb-3">Credenciales de demo</p>
              <button
                (click)="fillDemo()"
                class="btn-secondary w-full text-sm"
              >
                <span class="flex items-center justify-center gap-2">
                  <span class="text-primary">◈</span>
                  Usar cuenta demo
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly errorMsg = signal('');
  readonly showPassword = signal(false);

  readonly stats = [
    { value: '24/7', label: 'Monitoreo' },
    { value: '5+', label: 'Fuentes' },
    { value: 'Real-time', label: 'Alertas' },
  ];

  togglePassword() { this.showPassword.update(v => !v); }

  fillDemo() {
    this.email = 'demo@politicamonitor.com';
    this.password = 'demo1234';
  }

  async onSubmit() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.errorMsg.set('');
    try {
      await this.authService.login(this.email, this.password);
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      const msg: Record<string, string> = {
        'auth/invalid-credential': 'Email o contraseña incorrectos.',
        'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.',
        'auth/network-request-failed': 'Sin conexión a internet.',
      };
      this.errorMsg.set(msg[err?.code] ?? 'Error al iniciar sesión.');
    } finally {
      this.loading.set(false);
    }
  }
}
