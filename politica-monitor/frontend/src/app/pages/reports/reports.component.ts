import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

const SRC_COLORS: Record<string, string> = {
  WEB: '#0ea5e9', TWITTER: '#1d9bf0', FACEBOOK: '#1877f2',
  INSTAGRAM: '#e1306c', NEWS: '#f59e0b',
};
const SRC_ICONS: Record<string, string> = {
  WEB: '🌐', TWITTER: '🐦', FACEBOOK: '📘', INSTAGRAM: '📸', NEWS: '📰',
};

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full">
      <header class="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-border bg-surface/80 backdrop-blur-sm sticky top-0 z-30">
        <h1 class="text-lg font-semibold text-slate-100">Reportes y exportaciones</h1>
      </header>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 min-w-0">

        <!-- Config card -->
        <div class="card p-4 sm:p-6">
          <h2 class="text-sm font-semibold text-slate-200 mb-4">Configurar reporte</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Campaña</label>
              <select class="select" [(ngModel)]="selectedCampaignId" (change)="onCampaignChange()">
                @for (c of campaigns(); track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Período</label>
              <select class="select" [(ngModel)]="form.period">
                @for (p of periods; track p.value) {
                  <option [value]="p.value">{{ p.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Fuente</label>
              <select class="select" [(ngModel)]="form.source">
                @for (s of sources; track s.value) {
                  <option [value]="s.value">{{ s.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Sentimiento</label>
              <select class="select" [(ngModel)]="form.sentiment">
                @for (s of sentiments; track s.value) {
                  <option [value]="s.value">{{ s.label }}</option>
                }
              </select>
            </div>
          </div>
          <div class="mt-5">
            <button (click)="generate()" class="btn-primary flex items-center gap-2" [disabled]="loading() || !selectedCampaignId">
              @if (loading()) {
                <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Generando...
              } @else {
                Generar reporte
              }
            </button>
          </div>
        </div>

        @if (reportData(); as d) {

          <!-- Download section -->
          <div class="card p-6 border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
            <h2 class="text-sm font-semibold text-slate-200 mb-1">Descargar reporte</h2>
            <p class="text-xs text-muted mb-4">{{ d.summary.total | number }} menciones · {{ d.meta.period }} · {{ d.meta.generatedAt | date:'dd/MM/yyyy HH:mm' }}</p>
            <div class="flex flex-wrap gap-3">
              <button (click)="downloadCSV()" class="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors"
                style="background:#10b98115;border-color:#10b98130;color:#34d399;">
                CSV completo
                <span class="text-xs opacity-60">{{ d.allMentions.length }} filas</span>
              </button>
              <button (click)="downloadNegCSV()" class="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors"
                style="background:#ef444415;border-color:#ef444430;color:#f87171;">
                CSV menciones negativas
                <span class="text-xs opacity-60">{{ d.negativeMentions.length }} filas</span>
              </button>
              <button (click)="downloadTXT()" class="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors"
                style="background:#3b82f615;border-color:#3b82f630;color:#60a5fa;">
                Informe ejecutivo TXT
              </button>
              <button (click)="downloadJSON()" class="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors"
                style="background:#8b5cf615;border-color:#8b5cf630;color:#a78bfa;">
                JSON completo
              </button>
            </div>
          </div>

          <!-- Stat cards -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div class="stat-card">
              <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Total menciones</p>
              <p class="text-2xl font-bold text-primary">{{ d.summary.total | number }}</p>
              <p class="text-xs text-muted mt-1">
                <span [class.text-success]="d.summary.delta >= 0" [class.text-danger]="d.summary.delta < 0">
                  {{ d.summary.delta >= 0 ? '↑' : '↓' }} {{ d.summary.delta | number:'1.0-0' }}%
                </span>
                vs período anterior
              </p>
            </div>
            <div class="stat-card">
              <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Alcance total</p>
              <p class="text-2xl font-bold" style="color:#8b5cf6">{{ fmtNum(d.summary.totalReach) }}</p>
              <p class="text-xs text-muted mt-1">personas alcanzadas</p>
            </div>
            <div class="stat-card">
              <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Sentimiento positivo</p>
              <p class="text-2xl font-bold text-success">{{ d.sentiment.positive.pct }}%</p>
              <p class="text-xs text-muted mt-1">{{ d.sentiment.positive.count | number }} menciones</p>
            </div>
            <div class="stat-card">
              <p class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Sentimiento negativo</p>
              <p class="text-2xl font-bold text-danger">{{ d.sentiment.negative.pct }}%</p>
              <p class="text-xs text-muted mt-1">
                @if (d.sentiment.negative.pct > 40) {
                  <span class="text-warning">⚠ Requiere atención</span>
                } @else {
                  Bajo control
                }
              </p>
            </div>
          </div>

          <!-- Charts row -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">

            <!-- Sentiment donut -->
            <div class="card p-4 sm:p-6">
              <h3 class="text-sm font-semibold text-slate-200 mb-4">Distribución de sentimiento</h3>
              <div class="flex items-center gap-6">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" [attr.r]="donut().r" fill="none" stroke="#1e293b" stroke-width="18"/>
                  @for (seg of donut().segments; track $index) {
                    <circle cx="60" cy="60" [attr.r]="donut().r" fill="none"
                      [attr.stroke]="seg.color" stroke-width="18"
                      [attr.stroke-dasharray]="seg.dasharray"
                      [attr.stroke-dashoffset]="seg.dashoffset"
                      transform="rotate(-90 60 60)"/>
                  }
                </svg>
                <div class="flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-success flex-shrink-0"></span>
                    <span class="text-xs text-slate-300">Positivo {{ d.sentiment.positive.pct }}%</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-danger flex-shrink-0"></span>
                    <span class="text-xs text-slate-300">Negativo {{ d.sentiment.negative.pct }}%</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-muted/50 flex-shrink-0"></span>
                    <span class="text-xs text-slate-300">Neutral {{ d.sentiment.neutral.pct }}%</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Source bars -->
            <div class="card p-4 sm:p-6">
              <h3 class="text-sm font-semibold text-slate-200 mb-4">Menciones por fuente</h3>
              <div class="space-y-3">
                @for (s of d.bySource; track s.source) {
                  <div class="flex items-center gap-3">
                    <span class="text-xs text-muted w-20 truncate">{{ srcIcon(s.source) }} {{ s.source }}</span>
                    <div class="flex-1 h-2 bg-surface-hover rounded-full overflow-hidden">
                      <div class="h-full rounded-full transition-all"
                        [style.width.%]="s.pct"
                        [style.background]="srcColor(s.source)"></div>
                    </div>
                    <span class="text-xs text-slate-300 w-12 text-right">{{ s.count | number }}</span>
                    <span class="text-xs text-muted w-8 text-right">{{ s.pct }}%</span>
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Hourly volume line chart -->
          @if (d.hourlyVolume?.length > 1) {
            <div class="card p-4 sm:p-6">
              <h3 class="text-sm font-semibold text-slate-200 mb-4">Volumen horario — positivo vs negativo vs neutral</h3>
              <div class="overflow-x-auto">
                <svg [attr.width]="Math.max(600, d.hourlyVolume.length * 20)" height="160" class="min-w-full">
                  <!-- Grid lines -->
                  @for (y of [0.25, 0.5, 0.75, 1]; track y) {
                    <line x1="30" [attr.x2]="Math.max(600, d.hourlyVolume.length * 20) - 10"
                      [attr.y1]="10 + (1 - y) * 120" [attr.y2]="10 + (1 - y) * 120"
                      stroke="#1e293b" stroke-width="1"/>
                  }
                  <!-- Lines -->
                  <path [attr.d]="linePath(d.hourlyVolume, 'total', Math.max(600, d.hourlyVolume.length * 20))"
                    fill="none" stroke="#3b82f6" stroke-width="2"/>
                  <path [attr.d]="linePath(d.hourlyVolume, 'positive', Math.max(600, d.hourlyVolume.length * 20))"
                    fill="none" stroke="#10b981" stroke-width="1.5"/>
                  <path [attr.d]="linePath(d.hourlyVolume, 'negative', Math.max(600, d.hourlyVolume.length * 20))"
                    fill="none" stroke="#ef4444" stroke-width="1.5"/>
                </svg>
              </div>
              <div class="flex items-center gap-4 mt-2">
                <div class="flex items-center gap-1.5"><div class="w-4 h-0.5 bg-primary"></div><span class="text-xs text-muted">Total</span></div>
                <div class="flex items-center gap-1.5"><div class="w-4 h-0.5 bg-success"></div><span class="text-xs text-muted">Positivo</span></div>
                <div class="flex items-center gap-1.5"><div class="w-4 h-0.5 bg-danger"></div><span class="text-xs text-muted">Negativo</span></div>
              </div>
            </div>
          }

          <!-- Heatmap -->
          @if (heatmapWeeks().length > 0) {
            <div class="card p-4 sm:p-6">
              <h3 class="text-sm font-semibold text-slate-200 mb-3">Calendario de menciones — últimos 4 meses</h3>
              @if (heatmapStats(); as hs) {
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div class="bg-surface-hover rounded-lg p-3">
                    <p class="text-xs text-muted">Total en rango</p>
                    <p class="text-base font-bold text-slate-100">{{ hs.total | number }}</p>
                  </div>
                  <div class="bg-surface-hover rounded-lg p-3">
                    <p class="text-xs text-muted">Días con actividad</p>
                    <p class="text-base font-bold text-slate-100">{{ hs.activeDays }}</p>
                  </div>
                  <div class="bg-surface-hover rounded-lg p-3">
                    <p class="text-xs text-muted">Prom/día activo</p>
                    <p class="text-base font-bold text-slate-100">{{ hs.avgPerActive }}</p>
                  </div>
                </div>
                @if (hs.topDay) {
                  <p class="text-xs text-muted mb-3">Día con más menciones: <strong class="text-slate-300">{{ hs.topDay.key }}</strong> ({{ hs.topDay.count }})</p>
                }
              }
              <div class="overflow-x-auto">
                <div class="flex gap-1 min-w-max">
                  @for (week of heatmapWeeks(); track $index) {
                    <div class="flex flex-col gap-1">
                      @for (day of week; track $index) {
                        <div class="w-3 h-3 rounded-sm cursor-default transition-all hover:ring-1 hover:ring-primary/50"
                          [title]="day.key + ': ' + day.count + ' menciones'"
                          [style.background]="heatmapColor(day.count, heatmapStats()?.max)">
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <span class="text-xs text-muted">Menos</span>
                @for (step of heatmapScale; track step) {
                  <div class="w-3 h-3 rounded-sm" [style.background]="heatmapColor(step, heatmapStats()?.max || 1)"></div>
                }
                <span class="text-xs text-muted">Más</span>
              </div>
            </div>
          }

          <!-- Keywords performance -->
          @if (d.keywords?.length > 0) {
            <div class="card p-4 sm:p-6">
              <h3 class="text-sm font-semibold text-slate-200 mb-4">Rendimiento por keyword</h3>
              <div class="space-y-3">
                @for (kw of d.keywords; track kw.term) {
                  <div class="flex items-center gap-3 bg-surface-hover rounded-lg p-3">
                    <span class="w-2 h-2 rounded-full flex-shrink-0" [style.background]="kw.color || '#3b82f6'"></span>
                    <span class="flex-1 text-sm font-medium text-slate-200">{{ kw.term }}</span>
                    <div class="w-20 sm:w-36 h-1.5 bg-surface rounded-full overflow-hidden flex-shrink-0">
                      <div class="h-full bg-primary rounded-full" [style.width.%]="kw.pct"></div>
                    </div>
                    <span class="text-sm text-slate-300 w-20 text-right">{{ kw.mentions | number }} menciones</span>
                    <span class="text-xs text-muted w-8 text-right">{{ kw.pct }}%</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Source breakdown table -->
          @if (d.bySource?.length > 0) {
            <div class="card overflow-hidden">
              <div class="px-4 sm:px-6 py-4 border-b border-surface-border">
                <h3 class="text-sm font-semibold text-slate-200">Detalle por fuente</h3>
              </div>
              <div class="overflow-x-auto">
              <table class="w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th class="table-header">Fuente</th>
                    <th class="table-header">Menciones</th>
                    <th class="table-header">% del total</th>
                    <th class="table-header">Alcance</th>
                    <th class="table-header">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of d.bySource; track s.source) {
                    <tr class="hover:bg-surface-hover transition-colors">
                      <td class="table-cell font-semibold">{{ srcIcon(s.source) }} {{ s.source }}</td>
                      <td class="table-cell text-primary">{{ s.count | number }}</td>
                      <td class="table-cell">
                        <div class="flex items-center gap-2">
                          <div class="w-14 h-1 bg-surface rounded-full overflow-hidden">
                            <div class="h-full rounded-full" [style.width.%]="s.pct" [style.background]="srcColor(s.source)"></div>
                          </div>
                          <span class="text-xs text-muted">{{ s.pct }}%</span>
                        </div>
                      </td>
                      <td class="table-cell text-muted text-xs">{{ fmtNum(s.reach) }}</td>
                      <td class="table-cell text-muted text-xs">{{ fmtNum(s.engagement) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              </div>
            </div>
          }

          <!-- Negative words -->
          @if (d.topNegWords?.length > 0) {
            <div class="card p-4 sm:p-6">
              <h3 class="text-sm font-semibold text-slate-200 mb-4">Palabras frecuentes en menciones negativas</h3>
              <div class="flex flex-wrap gap-2">
                @for (w of d.topNegWords; track w.word) {
                  <span class="px-3 py-1 rounded-full text-sm font-semibold"
                    style="background:#ef444415;border:1px solid #ef444440;color:#f87171;">
                    {{ w.word }} <span class="opacity-60 text-xs">×{{ w.count }}</span>
                  </span>
                }
              </div>
            </div>
          }

          <!-- Top mentions -->
          @if (d.topMentions?.length > 0) {
            <div class="card p-4 sm:p-6">
              <h3 class="text-sm font-semibold text-slate-200 mb-4">Top 10 menciones por alcance</h3>
              <div class="space-y-3">
                @for (m of d.topMentions.slice(0, 10); track m.id; let i = $index) {
                  <div class="bg-surface-hover rounded-lg p-3 border border-surface-border">
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                      <span class="text-xs font-bold text-muted">#{{ i + 1 }}</span>
                      <span class="text-xs font-bold px-2 py-0.5 rounded-full"
                        [style.background]="srcColor(m.source) + '20'"
                        [style.color]="srcColor(m.source)">
                        {{ srcIcon(m.source) }} {{ m.source }}
                      </span>
                      @if (m.keyword) {
                        <span class="badge">{{ m.keyword.term }}</span>
                      }
                      <span class="ml-auto text-xs text-muted">{{ m.publishedAt | date:'dd/MM HH:mm' }}</span>
                      @if (m.reach > 0) {
                        <span class="text-xs text-muted">👁 {{ fmtNum(m.reach) }}</span>
                      }
                    </div>
                    <p class="text-sm text-slate-300 leading-relaxed">{{ (m.content || '').slice(0, 220) }}{{ m.content?.length > 220 ? '...' : '' }}</p>
                    @if (m.sourceUrl) {
                      <a [href]="m.sourceUrl" target="_blank" class="text-xs text-primary hover:underline mt-1 inline-block">Ver fuente →</a>
                    }
                  </div>
                }
              </div>
            </div>
          }

          <!-- Negative mentions -->
          @if (d.negativeMentions?.length > 0) {
            <div class="card p-4 sm:p-6">
              <h3 class="text-sm font-semibold mb-4" style="color:#f87171;">Menciones negativas recientes</h3>
              <div class="space-y-3">
                @for (m of d.negativeMentions.slice(0, 10); track m.id; let i = $index) {
                  <div class="rounded-lg p-3 border" style="background:#ef444408;border-color:#ef444430;">
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                      <span class="text-xs font-bold text-muted">#{{ i + 1 }}</span>
                      <span class="text-xs font-bold px-2 py-0.5 rounded-full"
                        [style.background]="srcColor(m.source) + '20'"
                        [style.color]="srcColor(m.source)">
                        {{ srcIcon(m.source) }} {{ m.source }}
                      </span>
                      <span class="ml-auto text-xs text-muted">{{ m.publishedAt | date:'dd/MM HH:mm' }}</span>
                    </div>
                    <p class="text-sm text-slate-300 leading-relaxed">{{ (m.content || '').slice(0, 200) }}{{ m.content?.length > 200 ? '...' : '' }}</p>
                    @if (m.sourceUrl) {
                      <a [href]="m.sourceUrl" target="_blank" class="text-xs text-primary hover:underline mt-1 inline-block">Ver fuente →</a>
                    }
                  </div>
                }
              </div>
            </div>
          }

        }

        <!-- Past reports -->
        <div class="card overflow-hidden">
          <div class="px-4 sm:px-6 py-4 border-b border-surface-border flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-slate-200">Reportes anteriores</h2>
            <select class="select text-xs py-1.5 w-48" [(ngModel)]="selectedCampaignId" (change)="onCampaignChange()">
              @for (c of campaigns(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </div>
          @if (pastLoading()) {
            <div class="p-6 space-y-2">
              @for (i of [1,2,3]; track i) { <div class="skeleton h-12 rounded-lg"></div> }
            </div>
          } @else if (pastReports().length === 0) {
            <div class="flex flex-col items-center justify-center py-12 text-muted">
              <span class="text-2xl mb-2">◈</span>
              <p class="text-sm">Sin reportes generados aún</p>
            </div>
          } @else {
            <div class="divide-y divide-surface-border">
              @for (r of pastReports(); track r.id) {
                <div class="flex items-center gap-3 px-6 py-3 hover:bg-surface-hover transition-colors">
                  <span class="text-base">◉</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-slate-200">Reporte {{ r.period }} — {{ r.type }}</p>
                  </div>
                  <span class="text-xs text-muted">{{ r.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
                </div>
              }
            </div>
          }
        </div>

      </div>
    </div>
  `,
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly Math = Math;

  readonly campaigns = signal<any[]>([]);
  readonly pastReports = signal<any[]>([]);
  readonly loading = signal(false);
  readonly pastLoading = signal(false);
  readonly reportData = signal<any>(null);
  readonly heatmapWeeks = signal<any[][]>([]);
  readonly heatmapStats = signal<any>(null);

  selectedCampaignId = '';
  form = { period: '24h', source: 'ALL', sentiment: 'ALL' };

  readonly heatmapScale = [0, 1, 3, 7, 15];

  periods = [
    { value: '1h', label: 'Última hora' },
    { value: '24h', label: 'Últimas 24h' },
    { value: '7d', label: 'Últimos 7 días' },
    { value: '30d', label: 'Últimos 30 días' },
    { value: '90d', label: 'Últimos 90 días' },
  ];
  sources = [
    { value: 'ALL', label: 'Todas las fuentes' },
    { value: 'FACEBOOK', label: 'Facebook' },
    { value: 'INSTAGRAM', label: 'Instagram' },
    { value: 'TWITTER', label: 'Twitter/X' },
    { value: 'NEWS', label: 'Noticias' },
    { value: 'WEB', label: 'Web' },
  ];
  sentiments = [
    { value: 'ALL', label: 'Todos' },
    { value: 'POSITIVE', label: 'Positivo' },
    { value: 'NEGATIVE', label: 'Negativo' },
    { value: 'NEUTRAL', label: 'Neutral' },
  ];

  readonly donut = computed(() => {
    const d = this.reportData();
    if (!d) return { segments: [], r: 40, circ: 0 };
    const r = 40;
    const circ = 2 * Math.PI * r;
    const total = d.summary.total || 1;
    const segs = [
      { pct: d.sentiment.positive.count / total, color: '#10b981' },
      { pct: d.sentiment.negative.count / total, color: '#ef4444' },
      { pct: d.sentiment.neutral.count / total, color: '#64748b' },
    ];
    let cumLen = 0;
    const segments = segs.map(s => {
      const len = s.pct * circ;
      const offset = circ / 4 - cumLen;
      cumLen += len;
      return { color: s.color, dasharray: `${len} ${circ}`, dashoffset: String(offset) };
    });
    return { segments, r, circ };
  });

  ngOnInit() {
    this.api.getCampaigns().subscribe({
      next: cs => {
        this.campaigns.set(cs);
        if (cs.length) {
          this.selectedCampaignId = cs[0].id;
          this.loadPastReports();
        }
      },
    });
  }

  onCampaignChange() {
    this.reportData.set(null);
    this.loadPastReports();
  }

  loadPastReports() {
    if (!this.selectedCampaignId) return;
    this.pastLoading.set(true);
    this.api.getReports(this.selectedCampaignId).subscribe({
      next: rs => { this.pastReports.set(rs); this.pastLoading.set(false); },
      error: () => this.pastLoading.set(false),
    });
  }

  generate() {
    this.loading.set(true);
    this.reportData.set(null);
    this.api.generateReport({ campaignId: this.selectedCampaignId, ...this.form }).subscribe({
      next: d => {
        this.reportData.set(d);
        this.buildHeatmap(d.allMentions || []);
        this.toast.success('Reporte generado');
        this.loading.set(false);
      },
      error: () => { this.toast.error('Error al generar reporte'); this.loading.set(false); },
    });
  }

  buildHeatmap(mentions: any[]) {
    const countByDate: Record<string, number> = {};
    for (const m of mentions) {
      const d = new Date(m.publishedAt ?? m.createdAt);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().split('T')[0];
      countByDate[key] = (countByDate[key] ?? 0) + 1;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - 7 * 17);
    start.setDate(start.getDate() - start.getDay());

    const weeks: any[][] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const week: any[] = [];
      for (let i = 0; i < 7; i++) {
        const key = cur.toISOString().split('T')[0];
        week.push({ key, count: countByDate[key] ?? 0 });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    this.heatmapWeeks.set(weeks);

    const allDays = weeks.flat();
    const total = allDays.reduce((a, d) => a + d.count, 0);
    const activeDays = allDays.filter(d => d.count > 0).length;
    const avgPerActive = activeDays > 0 ? (total / activeDays).toFixed(1) : '0';
    const max = Math.max(...Object.values(countByDate), 1);
    const topDay = Object.entries(countByDate).sort((a, b) => b[1] - a[1])[0];
    this.heatmapStats.set({
      total, activeDays, avgPerActive, max,
      topDay: topDay ? { key: topDay[0], count: topDay[1] } : null,
    });
  }

  heatmapColor(count: number, max: number = 1): string {
    if (!count) return '#1a1a2e';
    const ratio = count / max;
    if (ratio > 0.75) return '#818cf8';
    if (ratio > 0.5) return '#6366f1';
    if (ratio > 0.25) return '#4338ca';
    return '#312e81';
  }

  linePath(data: any[], field: string, width: number): string {
    if (!data?.length) return '';
    const W = width - 40, H = 130, padX = 30, padY = 10;
    const maxY = Math.max(...data.map((p: any) => p[field] || 0), 1);
    const pts = data.map((p: any, i: number) => {
      const x = padX + (i / Math.max(data.length - 1, 1)) * W;
      const y = padY + (1 - (p[field] || 0) / maxY) * H;
      return `${x},${y}`;
    });
    return `M ${pts.join(' L ')}`;
  }

  srcColor(source: string): string { return SRC_COLORS[source] ?? '#3b82f6'; }
  srcIcon(source: string): string { return SRC_ICONS[source] ?? '•'; }

  fmtNum(n: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  // ─── Downloads ──────────────────────────────────────────────────────────────

  downloadCSV() {
    const d = this.reportData();
    if (!d) return;
    const rows = [
      ['Fecha', 'Fuente', 'Keyword', 'Sentimiento', 'Alcance', 'Engagement', 'Autor', 'URL', 'Contenido'],
      ...d.allMentions.map((m: any) => [
        new Date(m.publishedAt).toLocaleString('es-AR'),
        m.source, m.keyword?.term ?? '', m.sentiment,
        m.reach ?? 0, m.engagement ?? 0, m.author ?? '',
        m.sourceUrl ?? '',
        `"${(m.content ?? '').replace(/"/g, "'").replace(/\n/g, ' ')}"`,
      ]),
    ];
    this.download('\uFEFF' + rows.map(r => r.join(';')).join('\n'),
      `reporte_${d.meta.campaign}_${d.meta.period}.csv`, 'text/csv;charset=utf-8');
    this.toast.success(`CSV descargado — ${d.allMentions.length} menciones`);
  }

  downloadNegCSV() {
    const d = this.reportData();
    if (!d) return;
    const rows = [
      ['Fecha', 'Fuente', 'Keyword', 'Alcance', 'Autor', 'URL', 'Contenido'],
      ...d.negativeMentions.map((m: any) => [
        new Date(m.publishedAt).toLocaleString('es-AR'),
        m.source, m.keyword?.term ?? '', m.reach ?? 0,
        m.author ?? '', m.sourceUrl ?? '',
        `"${(m.content ?? '').replace(/"/g, "'").replace(/\n/g, ' ')}"`,
      ]),
    ];
    this.download('\uFEFF' + rows.map(r => r.join(';')).join('\n'),
      `menciones_negativas_${d.meta.campaign}_${d.meta.period}.csv`, 'text/csv;charset=utf-8');
    this.toast.success(`CSV negativas descargado — ${d.negativeMentions.length} filas`);
  }

  downloadTXT() {
    const d = this.reportData();
    if (!d) return;
    const sep = '═'.repeat(60);
    const sep2 = '─'.repeat(60);
    const fmt = (n: number) => this.fmtNum(n);
    const lines = [
      sep,
      '  REPORTE DE MONITOREO POLÍTICO',
      `  Campaña: ${d.meta.campaign}`,
      `  Período: ${d.meta.period} | Generado: ${new Date(d.meta.generatedAt).toLocaleString('es-AR')}`,
      `  Analista: ${d.meta.analyst || 'Sistema'}`,
      sep, '',
      '📊 RESUMEN EJECUTIVO', sep2,
      `  Total menciones:      ${d.summary.total.toLocaleString()}`,
      `  Variación vs período: ${d.summary.delta >= 0 ? '+' : ''}${d.summary.delta}%`,
      `  Alcance total:        ${fmt(d.summary.totalReach)} personas`,
      `  Engagement total:     ${fmt(d.summary.totalEngagement)}`,
      '', '😊 ANÁLISIS DE SENTIMIENTO', sep2,
      `  Positivo:  ${d.sentiment.positive.count} menciones (${d.sentiment.positive.pct}%) — alcance: ${fmt(d.sentiment.positive.reach)}`,
      `  Negativo:  ${d.sentiment.negative.count} menciones (${d.sentiment.negative.pct}%) — alcance: ${fmt(d.sentiment.negative.reach)}`,
      `  Neutral:   ${d.sentiment.neutral.count} menciones (${d.sentiment.neutral.pct}%) — alcance: ${fmt(d.sentiment.neutral.reach)}`,
      d.sentiment.negative.pct > 40 ? '\n  ⚠️  ATENCIÓN: Sentimiento negativo supera el 40%.' : '',
      '', '🌐 MENCIONES POR FUENTE', sep2,
      ...d.bySource.map((s: any) => `  ${SRC_ICONS[s.source] ?? '•'} ${s.source.padEnd(12)} ${String(s.count).padStart(5)} menciones  (${s.pct}%)  alcance: ${fmt(s.reach)}`),
      '', '🔑 KEYWORDS', sep2,
      ...d.keywords.map((k: any, i: number) => `  ${String(i + 1).padStart(2)}. ${k.term.padEnd(30)} ${String(k.mentions).padStart(5)} menciones  (${k.pct}%)`),
      '', '⚠️  PALABRAS NEGATIVAS FRECUENTES', sep2,
      '  ' + d.topNegWords.slice(0, 10).map((w: any) => `"${w.word}" (${w.count})`).join('  |  '),
      '', '🔥 TOP 10 MENCIONES POR ALCANCE', sep2,
      ...d.topMentions.slice(0, 10).map((m: any, i: number) => [
        `  ${i + 1}. [${m.source}] ${new Date(m.publishedAt).toLocaleString('es-AR')} — Alcance: ${fmt(m.reach)}`,
        `     Sentimiento: ${m.sentiment}${m.keyword ? ` | Keyword: ${m.keyword.term}` : ''}`,
        `     ${(m.content ?? '').slice(0, 200).replace(/\n/g, ' ')}`,
        m.sourceUrl ? `     URL: ${m.sourceUrl}` : '',
        '',
      ].filter(Boolean).join('\n')),
      '', `📋 TODAS LAS MENCIONES (${d.allMentions.length})`, sep2,
      ...d.allMentions.map((m: any, i: number) => [
        `  ${i + 1}. [${m.source}] ${new Date(m.publishedAt).toLocaleString('es-AR')}${m.keyword ? ` | Keyword: ${m.keyword.term}` : ''}`,
        `     Sentimiento: ${m.sentiment} | Alcance: ${fmt(m.reach)}`,
        `     ${(m.content ?? '').replace(/\n/g, ' ')}`,
        m.sourceUrl ? `     URL: ${m.sourceUrl}` : '',
        '',
      ].filter(Boolean).join('\n')),
      '', sep,
      `  Fin del reporte — PoliticaMonitor © ${new Date().getFullYear()}`,
      sep,
    ].join('\n');

    this.download(lines, `reporte_ejecutivo_${d.meta.campaign}_${d.meta.period}.txt`, 'text/plain;charset=utf-8');
    this.toast.success('Reporte ejecutivo TXT descargado');
  }

  downloadJSON() {
    const d = this.reportData();
    if (!d) return;
    this.download(JSON.stringify(d, null, 2),
      `reporte_completo_${d.meta.campaign}_${d.meta.period}.json`, 'application/json');
    this.toast.success('JSON descargado');
  }

  private download(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
