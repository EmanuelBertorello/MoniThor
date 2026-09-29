import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

const SOURCE_TYPES = [
  { value: 'WEBSITE', label: 'Sitio web', icon: '◎' },
  { value: 'RSS_FEED', label: 'Feed RSS', icon: '◉' },
  { value: 'FACEBOOK_PAGE', label: 'Página Facebook', icon: '◈' },
  { value: 'REDDIT', label: 'Reddit', icon: '◐' },
];

@Component({
  selector: 'app-sources',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full">
      <header class="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-border bg-surface/80 backdrop-blur-sm sticky top-0 z-30">
        <div class="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <h1 class="text-lg font-semibold text-slate-100">Fuentes</h1>
          <select class="select text-sm py-1.5 w-full sm:w-48" [(ngModel)]="selectedCampaignId" (change)="loadSources()">
            @for (c of campaigns(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
        </div>
        <button (click)="openAdd()" class="btn-primary text-sm flex items-center gap-2">
          <span>+</span> Nueva fuente
        </button>
      </header>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-w-0">
        @if (loading()) {
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton h-20 rounded-xl"></div>
          }
        } @else if (sources().length === 0) {
          <div class="flex flex-col items-center justify-center py-24 gap-4">
            <div class="w-20 h-20 rounded-2xl bg-surface-card border border-surface-border flex items-center justify-center text-3xl">◎</div>
            <h2 class="text-lg font-semibold text-slate-200">Sin fuentes personalizadas</h2>
            <p class="text-muted text-sm text-center max-w-sm">Agregá sitios web, feeds RSS o páginas de Facebook para monitorear.</p>
            <button (click)="openAdd()" class="btn-primary mt-2">Agregar fuente</button>
          </div>
        } @else {
          @for (src of sources(); track src.id) {
            <div class="card p-5 flex items-center gap-4 hover:border-primary/20 transition-all group animate-fade-in">
              <div class="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-lg flex-shrink-0 border border-surface-border">
                {{ typeIcon(src.type) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-slate-200">{{ src.name }}</span>
                  <span class="badge badge-info text-[10px] uppercase">{{ src.type }}</span>
                  @if (!src.isActive) {
                    <span class="badge bg-muted/15 text-muted text-[10px]">Desactivada</span>
                  }
                </div>
                <a [href]="src.url" target="_blank" class="text-xs text-muted hover:text-primary transition-colors truncate block mt-0.5">{{ src.url }}</a>
                @if (src.lastScraped) {
                  <p class="text-[10px] text-muted mt-0.5">Último scrape: {{ src.lastScraped | date:'dd/MM HH:mm' }}</p>
                }
                @if (src.notes) {
                  <p class="text-[10px] text-muted/70 mt-0.5">{{ src.notes }}</p>
                }
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <!-- Test button -->
                <button (click)="testSource(src.id)"
                  [disabled]="testingId() === src.id"
                  class="btn-secondary py-1.5 px-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  @if (testingId() === src.id) {
                    <span class="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin inline-block"></span>
                  } @else {
                    Probar
                  }
                </button>
                <!-- Toggle active -->
                <button (click)="toggleSource(src)"
                  class="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
                  [class.bg-primary]="src.isActive"
                  [class.bg-surface-border]="!src.isActive">
                  <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    [class.left-5]="src.isActive"
                    [class.left-0.5]="!src.isActive">
                  </span>
                </button>
                <!-- Delete -->
                <button (click)="deleteSource(src.id)"
                  class="text-muted hover:text-danger transition-colors text-sm opacity-0 group-hover:opacity-100">✕</button>
              </div>
            </div>
          }
        }

        <!-- Test results -->
        @if (testResult()) {
          <div class="card p-5 animate-slide-up border-info/20">
            <h3 class="text-sm font-semibold text-slate-200 mb-3">Resultado del scrape</h3>
            <div class="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
              <div class="text-center">
                <div class="text-xl sm:text-2xl font-bold text-primary truncate">{{ testResult()!.count ?? 0 }}</div>
                <div class="text-xs text-muted">Menciones</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold" [class.text-success]="testResult()!.status === 'ok'" [class.text-danger]="testResult()!.status !== 'ok'">
                  {{ testResult()!.status === 'ok' ? '✓' : '✕' }}
                </div>
                <div class="text-xs text-muted">Estado</div>
              </div>
              <div class="text-center">
                <div class="text-xl sm:text-2xl font-bold text-warning truncate">{{ testResult()!.errors ?? 0 }}</div>
                <div class="text-xs text-muted">Errores</div>
              </div>
            </div>
            <button (click)="testResult.set(null)" class="btn-secondary text-xs">Cerrar</button>
          </div>
        }
      </div>
    </div>

    <!-- Add source modal -->
    @if (showModal()) {
      <div class="modal-overlay" (click)="showModal.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-5">Nueva fuente</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Tipo</label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                @for (t of sourceTypes; track t.value) {
                  <button (click)="selectType(t.value)"
                    class="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all"
                    [ngClass]="form.type === t.value
                      ? 'border-primary text-slate-200'
                      : 'border-surface-border text-muted'">
                    <span>{{ t.icon }}</span> {{ t.label }}
                  </button>
                }
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">URL</label>
              <input type="url" [(ngModel)]="form.url" class="input" placeholder="https://...">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nombre</label>
              <input type="text" [(ngModel)]="form.name" class="input" placeholder="Nombre descriptivo">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Notas (opcional)</label>
              <input type="text" [(ngModel)]="form.notes" class="input" placeholder="Notas adicionales">
            </div>
          </div>
          <div class="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button (click)="showModal.set(false)" class="btn-secondary flex-1">Cancelar</button>
            <button (click)="save()" class="btn-primary flex-1" [disabled]="!form.url || !form.name">Guardar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class SourcesComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly campaigns = signal<any[]>([]);
  readonly sources = signal<any[]>([]);
  readonly loading = signal(false);
  readonly showModal = signal(false);
  readonly testingId = signal<string | null>(null);
  readonly testResult = signal<any>(null);

  selectedCampaignId = '';
  form = { url: '', name: '', type: 'WEBSITE', notes: '' };
  readonly sourceTypes = SOURCE_TYPES;

  ngOnInit() {
    this.api.getCampaigns().subscribe({
      next: cs => {
        this.campaigns.set(cs);
        if (cs.length) { this.selectedCampaignId = cs[0].id; this.loadSources(); }
      },
    });
  }

  loadSources() {
    if (!this.selectedCampaignId) return;
    this.loading.set(true);
    this.api.getSources(this.selectedCampaignId).subscribe({
      next: d => { this.sources.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openAdd() { this.form = { url: '', name: '', type: 'WEBSITE', notes: '' }; this.showModal.set(true); }
  selectType(t: string) { this.form.type = t; }

  save() {
    this.api.createSource({ ...this.form, campaignId: this.selectedCampaignId }).subscribe({
      next: s => { this.sources.update(ss => [s, ...ss]); this.showModal.set(false); this.toast.success('Fuente agregada'); },
      error: () => this.toast.error('Error al guardar'),
    });
  }

  toggleSource(src: any) {
    this.api.updateSource(src.id, { isActive: !src.isActive }).subscribe({
      next: updated => { this.sources.update(ss => ss.map(s => s.id === src.id ? { ...s, ...updated } : s)); },
      error: () => this.toast.error('Error al actualizar'),
    });
  }

  deleteSource(id: string) {
    this.api.deleteSource(id).subscribe({
      next: () => { this.sources.update(ss => ss.filter(s => s.id !== id)); this.toast.success('Eliminada'); },
      error: () => this.toast.error('Error'),
    });
  }

  testSource(id: string) {
    this.testingId.set(id);
    this.testResult.set(null);
    this.api.testSource(id).subscribe({
      next: r => { this.testResult.set(r); this.testingId.set(null); this.toast.success('Scrape completado'); },
      error: (e) => { this.toast.error('Error al scrapear'); this.testingId.set(null); },
    });
  }

  typeIcon(type: string): string {
    return SOURCE_TYPES.find(t => t.value === type)?.icon ?? '◎';
  }
}
