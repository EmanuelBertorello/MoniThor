import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full">
      <header class="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-border bg-surface/80 backdrop-blur-sm sticky top-0 z-30">
        <div>
          <h1 class="text-lg font-semibold text-slate-100">Usuarios</h1>
          <p class="text-xs text-muted mt-0.5">Gestión de accesos y roles</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button (click)="limpiarDemos()" [disabled]="limpiando()"
            title="Elimina los usuarios demo cuyo acceso ya venció"
            class="btn-secondary text-sm disabled:opacity-40">
            {{ limpiando() ? '⏳' : '🧹 Limpiar demos vencidos' }}
          </button>
          <button (click)="openCrearDemo()" class="btn-secondary text-sm">👤 Acceso demo</button>
          <button (click)="openCreate()" class="btn-primary text-sm flex items-center gap-2">
            <span>+</span> Nuevo usuario
          </button>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6 min-w-0">
        @if (loading()) {
          <div class="space-y-3">
            @for (i of [1,2,3,4,5]; track i) {
              <div class="skeleton h-16 rounded-xl"></div>
            }
          </div>
        } @else {
          <!-- Stats row -->
          <div class="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
            @for (stat of userStats(); track stat.label) {
              <div class="stat-card text-center">
                <div class="text-xl sm:text-2xl font-bold truncate" [class]="stat.color">{{ stat.value }}</div>
                <div class="text-xs text-muted mt-1">{{ stat.label }}</div>
              </div>
            }
          </div>

          <!-- Table -->
          <div class="card overflow-hidden">
            <div class="overflow-x-auto">
            <table class="w-full min-w-[820px]">
              <thead>
                <tr>
                  <th class="table-header">Usuario</th>
                  <th class="table-header">Rol</th>
                  <th class="table-header">Plan</th>
                  <th class="table-header">Estado</th>
                  <th class="table-header">Campañas</th>
                  <th class="table-header">Registrado</th>
                  <th class="table-header w-24">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (u of users(); track u.id) {
                  <tr class="hover:bg-surface-hover transition-colors group">
                    <td class="table-cell">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-accent/60 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {{ initials(u.name) }}
                        </div>
                        <div>
                          <p class="text-sm font-medium text-slate-200">{{ u.name }}</p>
                          <p class="text-xs text-muted">{{ u.email }}</p>
                        </div>
                      </div>
                    </td>
                    <td class="table-cell">
                      <span class="badge text-[10px] uppercase"
                        [class.badge-info]="u.role === 'ADMIN'"
                        [class.badge-positive]="u.role === 'ANALYST'"
                        [class.badge-neutral]="u.role === 'VIEWER'">
                        {{ u.role }}
                      </span>
                    </td>
                    <td class="table-cell">
                      <span class="badge badge-warning text-[10px] uppercase">{{ u.plan }}</span>
                    </td>
                    <td class="table-cell">
                      <div class="flex items-center gap-1.5">
                        <div class="w-1.5 h-1.5 rounded-full"
                          [class.bg-success]="u.isActive"
                          [class.bg-muted]="!u.isActive">
                        </div>
                        <span class="text-xs" [class.text-success]="u.isActive" [class.text-muted]="!u.isActive">
                          {{ u.isActive ? 'Activo' : 'Inactivo' }}
                        </span>
                        @if (u.demoExpiresAt) {
                          <span class="badge bg-accent/15 text-accent text-[10px] ml-1">Demo</span>
                        }
                      </div>
                    </td>
                    <td class="table-cell text-muted text-sm font-mono">{{ u._count?.campaigns ?? 0 }}</td>
                    <td class="table-cell text-muted text-xs">{{ u.createdAt | date:'dd/MM/yyyy' }}</td>
                    <td class="table-cell">
                      <div class="flex items-center gap-2">
                        <button (click)="openEdit(u)" class="text-muted hover:text-primary transition-colors text-xs font-medium">Editar</button>
                        <button (click)="confirmDelete(u)" class="text-muted hover:text-danger transition-colors text-xs">✕</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <!-- Crear acceso demo: usuario temporal de solo lectura -->
    @if (showDemoModal()) {
      <div class="modal-overlay" (click)="showDemoModal.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-1">Crear acceso demo</h2>
          <p class="text-xs text-muted mb-5 leading-relaxed">
            Genera un usuario de solo lectura con una contraseña temporal que vence
            a los 30 minutos. Sirve para mostrarle el sistema a alguien sin darle
            acceso permanente.
          </p>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nombre</label>
              <input type="text" [(ngModel)]="demoForm.name" class="input" placeholder="Ej: Cristian">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
              <input type="email" [(ngModel)]="demoForm.email" class="input" placeholder="demo@ejemplo.com">
            </div>
          </div>
          <div class="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button (click)="showDemoModal.set(false)" class="btn-secondary flex-1">Cancelar</button>
            <button (click)="crearDemo()" class="btn-primary flex-1"
              [disabled]="creandoDemo() || !demoForm.name.trim() || !demoForm.email.trim()">
              {{ creandoDemo() ? 'Creando...' : 'Crear acceso' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Credenciales recién generadas: se muestran una sola vez -->
    @if (demoCreado(); as d) {
      <div class="modal-overlay" (click)="demoCreado.set(null)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-1">Acceso demo creado</h2>
          <p class="text-xs text-warning mb-5">
            Anotá la contraseña ahora: no se vuelve a mostrar. Vence en {{ d.expiresIn }}.
          </p>
          <div class="space-y-3">
            <div class="bg-surface-hover rounded-lg px-4 py-3">
              <p class="text-[10px] text-muted uppercase tracking-wider mb-1">Email</p>
              <p class="text-sm font-mono text-slate-100 break-all">{{ d.user.email }}</p>
            </div>
            <div class="bg-surface-hover rounded-lg px-4 py-3">
              <p class="text-[10px] text-muted uppercase tracking-wider mb-1">Contraseña temporal</p>
              <p class="text-sm font-mono text-primary break-all">{{ d.tempPassword }}</p>
            </div>
          </div>
          <button (click)="demoCreado.set(null)" class="btn-primary w-full mt-6">Listo, la anoté</button>
        </div>
      </div>
    }

    @if (showModal()) {
      <div class="modal-overlay" (click)="showModal.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-5">{{ editingUser() ? 'Editar usuario' : 'Nuevo usuario' }}</h2>
          <div class="space-y-4">
            @if (!editingUser()) {
              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
                <input type="email" [(ngModel)]="form.email" class="input" placeholder="usuario@email.com">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Contraseña temporal</label>
                <input type="text" [(ngModel)]="form.password" class="input" placeholder="Mínimo 6 caracteres">
              </div>
            }
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nombre</label>
              <input type="text" [(ngModel)]="form.name" class="input" placeholder="Nombre completo">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Rol</label>
                <select [(ngModel)]="form.role" class="select">
                  <option value="ADMIN">Administrador</option>
                  <option value="ANALYST">Analista</option>
                  <option value="VIEWER">Observador</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Plan</label>
                <select [(ngModel)]="form.plan" class="select">
                  <option value="BASICO">Básico</option>
                  <option value="CAMPANA">Campaña</option>
                  <option value="PREMIUM">Premium</option>
                </select>
              </div>
            </div>
            @if (!editingUser()) {
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative w-10 h-5 rounded-full transition-all"
                  [class.bg-primary]="form.isDemo"
                  [class.bg-surface-border]="!form.isDemo"
                  (click)="toggleDemo()">
                  <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    [class.left-5]="form.isDemo"
                    [class.left-0.5]="!form.isDemo">
                  </span>
                </div>
                <span class="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">Cuenta demo (expira en 30 min)</span>
              </label>
            }
            @if (editingUser()) {
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative w-10 h-5 rounded-full transition-all"
                  [class.bg-primary]="form.isActive"
                  [class.bg-surface-border]="!form.isActive"
                  (click)="toggleActive()">
                  <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    [class.left-5]="form.isActive"
                    [class.left-0.5]="!form.isActive">
                  </span>
                </div>
                <div>
                  <span class="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">Usuario activo</span>
                  <p class="text-xs text-muted mt-0.5 leading-relaxed">
                    Las campañas del usuario siguen este estado: al desactivarlo se pausan
                    todas y el scraper deja de buscar; al activarlo vuelven a correr.
                  </p>
                </div>
              </label>
            }
          </div>
          <div class="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button (click)="showModal.set(false)" class="btn-secondary flex-1">Cancelar</button>
            <button (click)="save()" class="btn-primary flex-1" [disabled]="saving()">
              @if (saving()) {
                <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"></span>
              }
              {{ editingUser() ? 'Guardar' : 'Crear' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Confirm delete -->
    @if (deletingUser()) {
      <div class="modal-overlay" (click)="deletingUser.set(null)">
        <div class="modal-box max-w-sm" (click)="$event.stopPropagation()">
          <div class="text-center mb-5">
            <div class="w-12 h-12 rounded-full bg-danger/10 border border-danger/30 flex items-center justify-center text-danger text-xl mx-auto mb-3">✕</div>
            <h2 class="text-base font-semibold text-slate-100">Eliminar usuario</h2>
            <p class="text-sm text-muted mt-1">¿Eliminar a <strong class="text-slate-200">{{ deletingUser()!.name }}</strong>? Esta acción no se puede deshacer.</p>
          </div>
          <div class="flex gap-3">
            <button (click)="deletingUser.set(null)" class="btn-secondary flex-1">Cancelar</button>
            <button (click)="deleteUser()" class="btn-danger flex-1" [disabled]="saving()">Eliminar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly users = signal<any[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showModal = signal(false);
  readonly editingUser = signal<any>(null);
  readonly deletingUser = signal<any>(null);
  readonly showDemoModal = signal(false);
  readonly creandoDemo = signal(false);
  readonly limpiando = signal(false);
  readonly demoCreado = signal<any>(null);
  demoForm = { name: '', email: '' };

  form: any = { email: '', password: '', name: '', role: 'ANALYST', plan: 'BASICO', isDemo: false, isActive: true };

  readonly userStats = () => {
    const us = this.users();
    return [
      { label: 'Total', value: us.length, color: 'text-slate-100' },
      { label: 'Activos', value: us.filter(u => u.isActive).length, color: 'text-success' },
      { label: 'Admins', value: us.filter(u => u.role === 'ADMIN').length, color: 'text-primary' },
    ];
  };

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getUsers().subscribe({
      next: d => { this.users.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCrearDemo() {
    this.demoForm = { name: '', email: '' };
    this.showDemoModal.set(true);
  }

  crearDemo() {
    if (!this.demoForm.name.trim() || !this.demoForm.email.trim()) return;
    this.creandoDemo.set(true);
    this.api.createDemoUser(this.demoForm).subscribe({
      next: (res: any) => {
        this.creandoDemo.set(false);
        this.showDemoModal.set(false);
        // La contraseña temporal sólo viaja en esta respuesta: se muestra una
        // vez y no queda guardada en ningún lado.
        this.demoCreado.set(res);
        this.load();
      },
      error: (err: any) => {
        this.creandoDemo.set(false);
        this.toast.error(err?.error?.error || 'Error al crear el acceso demo');
      },
    });
  }

  limpiarDemos() {
    this.limpiando.set(true);
    this.api.cleanupDemoUsers().subscribe({
      next: (res: any) => {
        this.limpiando.set(false);
        this.toast.success(res?.message || 'Demos vencidos eliminados');
        this.load();
      },
      error: () => {
        this.limpiando.set(false);
        this.toast.error('Error al limpiar los demos');
      },
    });
  }

  openCreate() {
    this.editingUser.set(null);
    this.form = { email: '', password: '', name: '', role: 'ANALYST', plan: 'BASICO', isDemo: false, isActive: true };
    this.showModal.set(true);
  }

  openEdit(u: any) {
    this.editingUser.set(u);
    this.form = { name: u.name, role: u.role, plan: u.plan, isActive: u.isActive };
    this.showModal.set(true);
  }

  save() {
    this.saving.set(true);
    const obs = this.editingUser()
      ? this.api.updateUser(this.editingUser().id, this.form)
      : this.api.createUser(this.form);
    obs.subscribe({
      next: (res: any) => {
        // El backend responde { user, campaignsUpdated }. Antes se usaba la
        // respuesta cruda como si fuera el usuario, asi que `res.id` era
        // undefined y la tabla no se actualizaba al editar (y al crear metia
        // una fila vacia).
        const usuario = res?.user ?? res;

        if (this.editingUser()) {
          this.users.update(us => us.map(u => (u.id === usuario.id ? usuario : u)));
          // El cambio de estado arrastra las campañas: se avisa cuántas.
          const n = res?.campaignsUpdated ?? 0;
          this.toast.success(n > 0
            ? `Usuario actualizado · ${n} campaña${n === 1 ? '' : 's'} ${usuario.isActive ? 'reactivada' : 'pausada'}${n === 1 ? '' : 's'}`
            : 'Usuario actualizado');
        } else {
          this.users.update(us => [usuario, ...us]);
          this.toast.success('Usuario creado');
        }
        this.showModal.set(false);
        this.saving.set(false);
      },
      error: () => { this.toast.error('Error al guardar'); this.saving.set(false); },
    });
  }

  confirmDelete(u: any) { this.deletingUser.set(u); }

  deleteUser() {
    const u = this.deletingUser();
    if (!u) return;
    this.saving.set(true);
    this.api.deleteUser(u.id).subscribe({
      next: () => {
        this.users.update(us => us.filter(x => x.id !== u.id));
        this.deletingUser.set(null);
        this.toast.success('Usuario eliminado');
        this.saving.set(false);
      },
      error: () => { this.toast.error('Error'); this.saving.set(false); },
    });
  }

  toggleDemo() { this.form.isDemo = !this.form.isDemo; }
  toggleActive() { this.form.isActive = !this.form.isActive; }

  initials(name: string): string {
    return (name ?? '').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  }
}
