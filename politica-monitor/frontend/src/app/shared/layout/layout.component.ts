import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: '⬡', route: '/dashboard' },
  { label: 'Reportes', icon: '◈', route: '/reports' },
  { label: 'Fuentes', icon: '◎', route: '/sources' },
  { label: 'Analizador', icon: '◉', route: '/analyzer' },
  { label: 'Usuarios', icon: '◐', route: '/users', adminOnly: true },
];

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="flex h-[100dvh] overflow-hidden bg-surface">

      <!-- Fondo oscuro detrás del drawer (solo mobile) -->
      @if (mobileOpen()) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
             (click)="closeMobile()" aria-hidden="true"></div>
      }

      <!-- Sidebar: drawer deslizable en mobile, columna fija en desktop -->
      <aside
        class="fixed lg:relative inset-y-0 left-0 z-50 w-64 flex flex-col shadow-sidebar
               border-r border-surface-border transition-[transform,width] duration-300
               flex-shrink-0 lg:translate-x-0"
        [class.-translate-x-full]="!mobileOpen()"
        [class.translate-x-0]="mobileOpen()"
        [ngClass]="collapsed() ? 'lg:w-16' : 'lg:w-64'"
      >
        <!-- Logo -->
        <div class="flex items-center justify-between h-16 px-4 border-b border-surface-border flex-shrink-0">
          @if (!collapsed()) {
            <div class="flex items-center gap-3 animate-fade-in min-w-0">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shadow-glow-sm flex-shrink-0">
                M
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-slate-100 leading-none truncate">Monitor</p>
                <p class="text-xs text-primary font-medium truncate">Político 2.0</p>
              </div>
            </div>
          } @else {
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shadow-glow-sm mx-auto">
              M
            </div>
          }
          <!-- Cerrar drawer (solo mobile) -->
          <button (click)="closeMobile()" aria-label="Cerrar menú"
            class="lg:hidden w-8 h-8 rounded-lg text-muted hover:text-slate-100 hover:bg-surface-hover flex-shrink-0">✕</button>
        </div>

        <!-- Nav -->
        <nav class="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          @if (!collapsed()) {
            <p class="section-title">Navegación</p>
          }
          @for (item of visibleNav(); track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              class="nav-link"
              [title]="collapsed() ? item.label : ''"
            >
              <span class="text-lg flex-shrink-0 w-6 text-center">{{ item.icon }}</span>
              @if (!collapsed()) {
                <span class="animate-fade-in truncate">{{ item.label }}</span>
              }
            </a>
          }
        </nav>

        <!-- Usuario + estado del socket -->
        <div class="border-t border-surface-border p-3 space-y-3 flex-shrink-0">
          @if (!collapsed()) {
            <div class="flex items-center gap-2 px-2">
              <div class="w-1.5 h-1.5 rounded-full flex-shrink-0" [class.bg-success]="socket.connected()" [class.bg-muted]="!socket.connected()"></div>
              <span class="text-xs text-muted truncate">{{ socket.connected() ? 'En vivo' : 'Desconectado' }}</span>
            </div>
          }

          <div class="flex items-center gap-3" [class.justify-center]="collapsed()">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {{ initials() }}
            </div>
            @if (!collapsed()) {
              <div class="flex-1 min-w-0 animate-fade-in">
                <p class="text-xs font-medium text-slate-200 truncate">{{ auth.appUser()?.name }}</p>
                <p class="text-xs text-muted truncate">{{ roleBadge() }}</p>
              </div>
            }
          </div>

          <button
            (click)="logout()"
            class="nav-link w-full hover:text-danger hover:bg-danger/10"
            [title]="collapsed() ? 'Cerrar sesión' : ''"
          >
            <span class="text-lg flex-shrink-0 w-6 text-center">↩</span>
            @if (!collapsed()) {
              <span class="animate-fade-in">Cerrar sesión</span>
            }
          </button>
        </div>

        <!-- Colapsar: no tiene sentido en mobile, donde el drawer se cierra entero -->
        <button
          (click)="toggleCollapsed()"
          aria-label="Colapsar menú"
          class="hidden lg:flex absolute top-1/2 -right-3 w-6 h-6 rounded-full bg-surface-border border border-surface-hover items-center justify-center text-muted hover:text-slate-100 hover:bg-surface-hover transition-all z-50"
        >
          {{ collapsed() ? '›' : '‹' }}
        </button>
      </aside>

      <!-- Columna principal. min-w-0 es obligatorio: sin eso un hijo flex usa
           min-width:auto y cualquier tabla o gráfico ancho desborda la página. -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Barra mobile con el botón de menú -->
        <div class="lg:hidden flex items-center gap-3 h-14 px-4 border-b border-surface-border bg-surface/90 backdrop-blur-sm flex-shrink-0">
          <button (click)="toggleMobile()" aria-label="Abrir menú"
            class="w-9 h-9 rounded-lg border border-surface-border text-slate-200 hover:bg-surface-hover flex items-center justify-center text-lg flex-shrink-0">
            ☰
          </button>
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-6 h-6 rounded bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">M</div>
            <span class="text-sm font-semibold text-slate-100 truncate">Monitor Político</span>
          </div>
        </div>

        <main class="flex-1 overflow-y-auto min-w-0">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100dvh; }
    aside { background: #0a0a18; }
  `],
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  readonly socket = inject(SocketService);
  private router = inject(Router);

  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);

  constructor() {
    // Navegar cierra el drawer: si no, en mobile el menú tapa la vista a la
    // que acabás de entrar.
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.mobileOpen.set(false));
  }

  readonly visibleNav = () =>
    NAV_ITEMS.filter(n => !n.adminOnly || this.auth.isAdmin());

  toggleCollapsed() { this.collapsed.update(v => !v); }
  toggleMobile() { this.mobileOpen.update(v => !v); }
  closeMobile() { this.mobileOpen.set(false); }

  initials(): string {
    const name = this.auth.appUser()?.name ?? '';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  }

  roleBadge(): string {
    const map: Record<string, string> = { ADMIN: 'Administrador', ANALYST: 'Analista', VIEWER: 'Observador' };
    return map[this.auth.appUser()?.role ?? ''] ?? '';
  }

  logout() {
    this.auth.logout();
  }
}
