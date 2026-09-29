import { Component, inject, input, signal, computed, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { ToastService } from '../../core/services/toast.service';

interface TestResult {
  source: string;
  keyword?: string;
  content?: string;
  sourceUrl?: string;
  extra?: { comments?: any[]; commentsTopWords?: { word: string; count: number }[] };
}

@Component({
  selector: 'app-scraper-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-5">

      <!-- Aviso de costo: este panel consume Apify real -->
      <div class="card p-4 sm:p-5 border-accent/30 bg-gradient-to-br from-accent/5 to-primary/5">
        <h3 class="text-sm font-semibold text-slate-100 mb-1.5">🧪 Realizar prueba</h3>
        <p class="text-xs text-muted leading-relaxed">
          Corre Facebook e Instagram (Apify) para las palabras clave que elijas, sin filtrar
          por antigüedad, y guarda igual que una corrida normal: lo que encuentre aparece en el Feed.
        </p>
        <p class="text-xs text-warning mt-2 leading-relaxed">
          ⚠️ Consume crédito real de Apify. Cada palabra clave × red es una llamada paga.
          Traer los comentarios multiplica el costo: dejalo desactivado salvo que los necesites.
        </p>
      </div>

      <div class="card p-4 sm:p-5 space-y-4">
        <!-- Redes -->
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Redes</label>
          <div class="flex flex-wrap gap-2">
            <button (click)="platforms.facebook = !platforms.facebook" [disabled]="running()"
              class="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40"
              [class]="platforms.facebook ? 'border-primary bg-primary/15 text-primary' : 'border-surface-border text-muted'">
              📘 Facebook
            </button>
            <button (click)="platforms.instagram = !platforms.instagram" [disabled]="running()"
              class="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40"
              [class]="platforms.instagram ? 'border-primary bg-primary/15 text-primary' : 'border-surface-border text-muted'">
              📸 Instagram
            </button>
          </div>
        </div>

        <!-- Palabras clave -->
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
            Palabras clave a probar
          </label>
          @if (keywordOptions().length === 0) {
            <p class="text-xs text-muted">Esta campaña no tiene palabras clave activas.</p>
          } @else {
            <div class="flex flex-wrap gap-2">
              @for (k of keywordOptions(); track k.id) {
                <button (click)="toggleKeyword(k.term)" [disabled]="running()"
                  class="px-3 py-1.5 rounded-full border text-xs transition-colors disabled:opacity-40"
                  [class]="selectedKeywords().includes(k.term) ? 'border-accent bg-accent/15 text-accent' : 'border-surface-border text-muted'">
                  {{ k.term }}
                </button>
              }
            </div>
          }
        </div>

        <!-- Opciones -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Posts por palabra y red
            </label>
            <input type="number" min="1" max="10" [(ngModel)]="count" [disabled]="running()"
              class="input w-full sm:w-32">
          </div>
          <div class="flex items-end">
            <button (click)="skipComments = !skipComments" [disabled]="running()"
              class="px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 w-full sm:w-auto"
              [class]="skipComments ? 'border-success bg-success/10 text-success' : 'border-surface-border text-muted'">
              {{ skipComments ? '✓ Sin comentarios (más barato)' : 'Traer comentarios (más caro)' }}
            </button>
          </div>
        </div>

        <button (click)="run()" [disabled]="!canRun()"
          class="btn-primary w-full sm:w-auto">
          {{ running() ? '⏳ Corriendo...' : '🧪 Realizar prueba' }}
        </button>
      </div>

      <!-- Progreso -->
      @if (running()) {
        <div class="card p-4 sm:p-5">
          <div class="h-2.5 bg-surface rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
              [style.width.%]="pct()"></div>
          </div>
          <p class="text-xs text-muted mt-2">
            @if (progress().total > 0) {
              {{ progress().done }}/{{ progress().total }}
              @if (progress().platform) { — {{ progress().platform === 'facebook' ? '📘' : '📸' }} }
              {{ progress().keyword }}
              @if (progress().skipped) { <span class="text-warning">(salteado, se corrió hace menos de 5 min)</span> }
            } @else {
              Iniciando...
            }
          </p>
        </div>
      }

      @if (error()) {
        <div class="card p-4 border-danger/30 bg-danger/5">
          <p class="text-sm text-danger">{{ error() }}</p>
        </div>
      }

      <!-- Resultados -->
      @if (results(); as rs) {
        <div class="space-y-3">
          <p class="text-xs text-muted">{{ rs.length }} resultado{{ rs.length === 1 ? '' : 's' }}</p>
          @if (rs.length === 0) {
            <div class="card p-5 text-center">
              <p class="text-sm text-muted">
                Sin coincidencias. Probá subir la cantidad de posts o revisar las palabras clave.
              </p>
            </div>
          }
          @for (r of rs; track $index) {
            <div class="card p-4">
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="text-[10px] font-bold" [class.text-info]="r.source === 'FACEBOOK'" [class.text-accent]="r.source !== 'FACEBOOK'">
                  {{ r.source === 'FACEBOOK' ? '📘 Facebook' : '📸 Instagram' }}
                </span>
                <span class="text-[10px] text-muted">palabra clave: {{ r.keyword }}</span>
                @if (r.sourceUrl) {
                  <a [href]="r.sourceUrl" target="_blank" rel="noopener"
                    class="text-[10px] text-primary hover:underline ml-auto">ver post ↗</a>
                }
              </div>
              <p class="text-sm text-slate-300 leading-relaxed line-clamp-4">{{ r.content }}</p>
              <p class="text-xs text-muted mt-2">
                💬 {{ r.extra?.comments?.length || 0 }} comentarios
                @if (r.extra?.commentsTopWords?.length) {
                  · top palabras:
                  @for (w of r.extra!.commentsTopWords!; track w.word) {
                    <span>{{ w.word }} ({{ w.count }}) </span>
                  }
                }
              </p>
            </div>
          }
        </div>
      }

      <!-- Historial -->
      @if (history().length > 0) {
        <div class="card overflow-hidden">
          <div class="px-4 sm:px-5 py-3 border-b border-surface-border">
            <h3 class="text-sm font-semibold text-slate-200">🕘 Corridas anteriores</h3>
          </div>
          <div class="divide-y divide-surface-border max-h-72 overflow-y-auto">
            @for (h of history(); track h.id) {
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2.5 text-xs">
                <span>{{ h.status === 'done' ? '✅' : h.status === 'error' ? '❌' : '⏳' }}</span>
                <span class="text-muted">{{ fecha(h.startedAt) }}</span>
                <span class="text-slate-300 truncate">{{ (h.keywords || []).join(', ') }}</span>
                <span class="text-muted ml-auto">{{ h.saved ?? 0 }} guardadas</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ScraperTestComponent implements OnDestroy {
  private api = inject(ApiService);
  private socket = inject(SocketService);
  private toast = inject(ToastService);

  readonly campaignId = input.required<string>();
  readonly keywordOptions = input<any[]>([]);

  readonly running = signal(false);
  readonly results = signal<TestResult[] | null>(null);
  readonly history = signal<any[]>([]);
  readonly error = signal('');
  readonly selectedKeywords = signal<string[]>([]);
  readonly progress = signal({ done: 0, total: 0, keyword: '', platform: '', skipped: false });

  platforms = { facebook: true, instagram: true };
  count = 3;
  // Por defecto sin comentarios: el actor de comentarios es la parte cara de
  // Apify y en una prueba casi nunca hace falta.
  skipComments = true;

  private runId = '';
  private pollTimer: any = null;
  private subs: Subscription[] = [];
  private lastCampaignId = '';
  private preseleccionHecha = false;

  constructor() {
    this.subs.push(
      this.socket.scraperProgress$.subscribe(d => this.onProgress(d)),
    );

    // Al cambiar de campaña se preseleccionan todas sus palabras clave y se
    // limpia lo de la corrida anterior. Va en un effect y no en el computed de
    // canRun(): escribir señales adentro de un computed no está permitido y
    // dejaba el botón deshabilitado para siempre.
    effect(() => {
      const id = this.campaignId();
      const kws = this.keywordOptions();
      if (!id) return;
      const cambioCampana = id !== this.lastCampaignId;
      if (cambioCampana) {
        this.lastCampaignId = id;
        this.results.set(null);
        this.error.set('');
        this.loadHistory();
      }
      // Preseleccionar todo solo al cambiar de campaña, o la primera vez que
      // llegan las keywords (suelen cargar después del id). Se usa una bandera
      // plana y no `selectedKeywords()`: leer adentro del effect la misma señal
      // que se escribe lo vuelve a disparar en loop y cuelga la página.
      if (cambioCampana) this.preseleccionHecha = false;
      if (!this.preseleccionHecha && kws.length > 0) {
        this.preseleccionHecha = true;
        this.selectedKeywords.set(kws.map(k => k.term));
      }
    }, { allowSignalWrites: true });
  }

  readonly canRun = computed(() =>
    !this.running()
    && !!this.campaignId()
    && (this.platforms.facebook || this.platforms.instagram)
    && this.selectedKeywords().length > 0);

  readonly pct = computed(() => {
    const p = this.progress();
    if (p.total > 0) return Math.round((p.done / p.total) * 100);
    return this.running() ? 5 : 0;
  });

  toggleKeyword(term: string) {
    this.selectedKeywords.update(ks =>
      ks.includes(term) ? ks.filter(t => t !== term) : [...ks, term]);
  }

  fecha(v: any): string {
    try {
      const d = v?._seconds ? new Date(v._seconds * 1000) : new Date(v);
      return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-AR');
    } catch { return '—'; }
  }

  loadHistory() {
    const id = this.campaignId();
    if (!id) return;
    this.api.getScraperTestHistory(id).subscribe({
      next: runs => this.history.set(runs ?? []),
      error: () => {},
    });
  }

  private onProgress(d: any) {
    if (!d || d.runId !== this.runId) return;
    if (d.status === 'running' || d.status === 'skipped') {
      this.progress.set({
        done: d.done ?? 0, total: d.total ?? 0,
        keyword: d.keyword ?? '', platform: d.platform ?? '',
        skipped: d.status === 'skipped',
      });
    } else if (d.status === 'done') {
      this.finish(d.results ?? []);
    } else if (d.status === 'error' && d.total === undefined) {
      this.fail(d.error || 'Error desconocido');
    }
  }

  // El socket solo funciona corriendo local. En Cloud Functions no hay conexión
  // persistente, así que el polling es lo único que mueve la barra ahí.
  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.api.getScraperTestStatus(this.runId).subscribe({
        next: r => {
          const run = r?.run;
          if (!run) return;
          if (run.status === 'done') this.finish(this.results() ?? []);
          else if (run.status === 'error') this.fail(run.error || 'Error desconocido');
          else this.progress.set({
            done: run.done ?? 0, total: run.total ?? 0,
            keyword: run.keyword ?? '', platform: run.platform ?? '',
            skipped: run.status === 'skipped',
          });
        },
        error: () => {},
      });
    }, 2500);
  }

  private stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private finish(results: TestResult[]) {
    this.results.set(results);
    this.running.set(false);
    this.stopPolling();
    this.loadHistory();
  }

  private fail(msg: string) {
    this.error.set(msg);
    this.running.set(false);
    this.stopPolling();
  }

  run() {
    if (!this.canRun()) return;
    const platforms = Object.entries(this.platforms)
      .filter(([, v]) => v).map(([k]) => k);

    this.runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.running.set(true);
    this.results.set(null);
    this.error.set('');
    this.progress.set({ done: 0, total: 0, keyword: '', platform: '', skipped: false });
    this.startPolling();

    this.api.runScraperTest({
      campaignId: this.campaignId(),
      count: this.count,
      runId: this.runId,
      platforms,
      keywords: this.selectedKeywords(),
      skipComments: this.skipComments,
    }).subscribe({
      next: res => {
        this.finish(res?.results ?? []);
        if (res?.saved > 0) this.toast.success(`${res.saved} menciones nuevas guardadas`);
        if (res?.capped) this.toast.info('Se acotó a las primeras palabras clave para limitar el gasto');
      },
      error: err => this.fail(err?.error?.error || 'Error al correr la prueba'),
    });
  }

  ngOnDestroy() {
    this.stopPolling();
    this.subs.forEach(s => s.unsubscribe());
  }
}
