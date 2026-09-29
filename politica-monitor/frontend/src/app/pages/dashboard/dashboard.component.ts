import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { ToastService } from '../../core/services/toast.service';
import { PROVINCIAS, ciudadesDe } from '../../core/data/argentina-geo';
import { ScraperTestComponent } from './scraper-test.component';
import { downloadMentionsXLSX, downloadMentionsTXT, stamp } from '../../core/data/export-mentions';
import { MentionsHeatmapComponent } from '../../shared/heatmap/mentions-heatmap.component';

export interface MentionComment {
  text: string;
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null;
  author?: string | null;
}

const SENT_COLORS: Record<string, string> = {
  POSITIVE: '#10b981', NEGATIVE: '#ef4444', NEUTRAL: '#64748b',
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ScraperTestComponent, MentionsHeatmapComponent],
  template: `
    <div class="flex flex-col h-full">

      <!-- Top bar -->
      <header class="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-border bg-surface/80 backdrop-blur-sm sticky top-0 z-30 flex-shrink-0">
        <div class="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <h1 class="text-lg font-semibold text-slate-100">Dashboard</h1>
          @if (campaigns().length > 0) {
            <select class="select text-sm py-1.5 pl-3 pr-8 w-full sm:w-auto sm:min-w-[200px] max-w-full" [(ngModel)]="selectedCampaignId" (change)="onCampaignChange()">
              @for (c of campaigns(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>

            <!-- Zona de la campaña: se muestra acá porque es lo que define el
                 alcance geográfico de todo lo que trae el scraper. -->
            @if (activeCampaign(); as c) {
              <div class="flex items-center gap-1.5 flex-shrink-0">
                @if (c.provincia) {
                  <span class="badge badge-info text-[10px]" [title]="'Zona de búsqueda: ' + (c.ciudad ? c.ciudad + ', ' : '') + c.provincia">
                    📍 {{ c.ciudad || c.provincia }}
                  </span>
                } @else {
                  <span class="badge badge-warning text-[10px]" title="Sin zona configurada: la búsqueda es nacional">
                    📍 Sin zona
                  </span>
                }
                <button (click)="openEditCampaign()" title="Editar campaña"
                  class="w-7 h-7 rounded-lg border border-surface-border text-muted hover:text-slate-100 hover:bg-surface-hover transition-colors text-xs">✎</button>
                <button (click)="showDeleteCampaign.set(true)" title="Eliminar campaña"
                  class="w-7 h-7 rounded-lg border border-surface-border text-muted hover:text-danger hover:bg-danger/10 transition-colors text-xs">🗑</button>
              </div>
            }
          }
          <button (click)="openCreateCampaign()" title="Nueva campaña"
            class="btn-secondary text-xs py-1.5 px-3 flex-shrink-0">+ Campaña</button>
        </div>
        <div class="flex items-center gap-3">
          @if (activeTab() === 'analysis') {
            <div class="flex items-center gap-1 bg-surface-card border border-surface-border rounded-lg p-1">
              @for (p of periods; track p.value) {
                <button (click)="setPeriod(p.value)"
                  class="px-3 py-1 rounded-md text-xs font-medium transition-all"
                  [class.bg-primary]="period() === p.value"
                  [class.text-white]="period() === p.value"
                  [class.text-muted]="period() !== p.value">{{ p.label }}</button>
              }
            </div>
          }
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
            [ngClass]="socketService.connected() ? 'border-success bg-success/5' : 'border-surface-border'">
            <div class="w-1.5 h-1.5 rounded-full"
              [class.bg-success]="socketService.connected()" [class.bg-muted]="!socketService.connected()"
              [class.animate-pulse]="socketService.connected()"></div>
            <span class="text-xs font-medium"
              [class.text-success]="socketService.connected()" [class.text-muted]="!socketService.connected()">
              {{ socketService.connected() ? 'En vivo' : 'Offline' }}
            </span>
          </div>
        </div>
      </header>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto">

        @if (loadingData()) {
          <div class="p-4 sm:p-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            @for (i of [1,2,3,4]; track i) {
              <div class="stat-card"><div class="skeleton h-12 rounded-lg"></div></div>
            }
          </div>

        } @else if (campaigns().length === 0) {
          <div class="flex flex-col items-center justify-center py-24 gap-4">
            <div class="w-20 h-20 rounded-2xl bg-surface-card border border-surface-border flex items-center justify-center text-3xl">◎</div>
            <h2 class="text-xl font-semibold text-slate-200">Sin campañas</h2>
            <p class="text-muted text-sm">Creá tu primera campaña para empezar a monitorear.</p>
            <button (click)="openCreateCampaign()" class="btn-primary mt-2">Nueva campaña</button>
          </div>

        } @else {

          <!-- Banners -->
          <div class="px-4 sm:px-6 pt-4 space-y-3">
            @if (summary()?.campaign?.status === 'WARMING_UP') {
              <div class="bg-warning/10 border border-warning/30 rounded-xl px-5 py-3 flex items-center gap-3 animate-fade-in">
                <span class="text-warning text-xl">⟳</span>
                <div>
                  <p class="text-warning font-medium text-sm">Campaña en calentamiento</p>
                  <p class="text-warning/70 text-xs mt-0.5">El scraper está indexando las primeras menciones. Puede tardar hasta 1 hora.</p>
                </div>
              </div>
            }
            @if (liveAlert()) {
              <div class="bg-danger/10 border border-danger/30 rounded-xl px-4 sm:px-5 py-3 flex items-start sm:items-center justify-between gap-3 animate-slide-up">
                <div class="flex items-center gap-3">
                  <span class="text-danger text-xl">⚠</span>
                  <div>
                    <p class="text-danger font-medium text-sm">{{ liveAlert()?.message }}</p>
                    <p class="text-danger/70 text-xs">Alerta activa · {{ liveAlert()?.type }}</p>
                  </div>
                </div>
                <button (click)="liveAlert.set(null)" class="text-muted hover:text-slate-300 transition-colors">✕</button>
              </div>
            }
          </div>

          <!-- Stat cards -->
          <div class="px-4 sm:px-6 pt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div class="stat-card">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-muted uppercase tracking-wider">Total menciones</span>
                <span class="text-xl text-primary">◎</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-slate-100 truncate">{{ summary()?.total ?? 0 }}</div>
              @if (summary()?.delta != null) {
                <div class="mt-2 text-xs" [class.text-success]="summary()!.delta >= 0" [class.text-danger]="summary()!.delta < 0">
                  {{ summary()!.delta >= 0 ? '▲' : '▼' }} {{ summary()!.delta | number:'1.0-1' }}%
                  <span class="text-muted">vs período anterior</span>
                </div>
              }
            </div>
            <div class="stat-card">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-muted uppercase tracking-wider">Positivas</span>
                <span class="text-success text-xl">◉</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-success truncate">{{ summary()?.bySentiment?.POSITIVE ?? 0 }}</div>
              <div class="mt-2 text-xs text-muted">{{ sentimentPct('POSITIVE') }}% del total</div>
            </div>
            <div class="stat-card">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-muted uppercase tracking-wider">Negativas</span>
                <span class="text-danger text-xl">◐</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-danger truncate">{{ summary()?.bySentiment?.NEGATIVE ?? 0 }}</div>
              <div class="mt-2 text-xs text-muted">{{ sentimentPct('NEGATIVE') }}% del total
                @if (sentimentPct('NEGATIVE') > 40) {
                  <span class="text-warning ml-1">⚠ Alto</span>
                }
              </div>
            </div>
            <div class="stat-card">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-muted uppercase tracking-wider">Alcance total</span>
                <span class="text-accent text-xl">◈</span>
              </div>
              <div class="text-2xl sm:text-3xl font-bold text-slate-100 truncate">{{ formatReach(summary()?.reach) }}</div>
              <div class="mt-2 text-xs text-muted">Suma de interacciones</div>
            </div>
          </div>

          <!-- Tab bar -->
          <div class="px-4 sm:px-6 pt-5 pb-0 border-b border-surface-border flex items-center gap-1 overflow-x-auto no-scrollbar">
            @for (tab of tabs; track tab.id) {
              <button (click)="setTab(tab.id)"
                class="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap flex-shrink-0"
                [class.border-primary]="activeTab() === tab.id"
                [class.text-primary]="activeTab() === tab.id"
                [class.border-transparent]="activeTab() !== tab.id"
                [class.text-muted]="activeTab() !== tab.id"
                [class.hover:text-slate-300]="activeTab() !== tab.id">
                {{ tab.icon }} {{ tab.label }}
                @if (tab.id === 'feed' && newMentionCount() > 0) {
                  <span class="bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {{ newMentionCount() > 99 ? '99+' : newMentionCount() }}
                  </span>
                }
              </button>
            }
          </div>

          <!-- Tab content -->
          <div class="p-4 sm:p-6">

            <!-- ═══ FEED TAB ═══ -->
            @if (activeTab() === 'feed') {
              <div class="space-y-4">
                <!-- Filters row -->
                <div class="flex flex-wrap gap-3">
                  <select class="select text-sm py-1.5 w-full sm:w-44" [(ngModel)]="filterSentiment" (change)="onFilterChange()">
                    <option value="">Todos los sentimientos</option>
                    <option value="POSITIVE">😊 Positivo</option>
                    <option value="NEGATIVE">⚠️ Negativo</option>
                    <option value="NEUTRAL">😐 Neutral</option>
                  </select>
                  <select class="select text-sm py-1.5 w-full sm:w-44" [(ngModel)]="filterSource" (change)="onFilterChange()">
                    <option value="">Todas las fuentes</option>
                    <option value="WEB">🌐 Web</option>
                    <option value="NEWS">📰 Noticias</option>
                    <option value="FACEBOOK">📘 Facebook</option>
                    <option value="INSTAGRAM">📸 Instagram</option>
                    <option value="TWITTER">🐦 Twitter/X</option>
                  </select>
                  @if (newMentionCount() > 0) {
                    <button (click)="refreshFeed()" class="btn-secondary text-sm flex items-center gap-2">
                      <span class="animate-pulse text-success">●</span>
                      {{ newMentionCount() }} nueva{{ newMentionCount() > 1 ? 's' : '' }} — Actualizar
                    </button>
                  }
                  <div class="w-full sm:w-auto sm:ml-auto flex items-center gap-2">
                    <span class="text-xs text-muted">{{ totalMentions() | number }} menciones totales</span>
                    <button (click)="exportarMenciones('xlsx')" [disabled]="exportando()"
                      title="Descargar Excel con contenido completo y comentarios"
                      class="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40">
                      {{ exportando() ? '⏳' : '⬇ Excel' }}
                    </button>
                    <button (click)="exportarMenciones('txt')" [disabled]="exportando()"
                      title="Descargar TXT con contenido completo y comentarios"
                      class="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40">⬇ TXT</button>
                  </div>
                </div>

                <!-- Mention cards -->
                @if (loadingMentions()) {
                  <div class="space-y-3">
                    @for (i of [1,2,3,4,5]; track i) {
                      <div class="skeleton h-24 rounded-xl"></div>
                    }
                  </div>
                } @else if (mentions().length === 0) {
                  <div class="flex flex-col items-center justify-center py-20 text-muted">
                    <span class="text-4xl mb-3">◎</span>
                    <p class="text-sm">Sin menciones para los filtros seleccionados</p>
                  </div>
                } @else {
                  <div class="space-y-3">
                    @for (m of mentions(); track m.id) {
                      <div class="card p-4 hover:border-primary/40 transition-all group cursor-pointer" (click)="selectedMention.set(m)">
                        <div class="flex items-start justify-between gap-3 mb-2">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="badge text-[10px] font-mono px-2 py-0.5"
                              [class.badge-positive]="m.sentiment === 'POSITIVE'"
                              [class.badge-negative]="m.sentiment === 'NEGATIVE'"
                              [class.badge-neutral]="m.sentiment === 'NEUTRAL'">
                              {{ m.sentiment }}
                            </span>
                            <span class="text-[10px] text-muted font-semibold uppercase tracking-wider">{{ m.source }}</span>
                            @if (m.author) {
                              <span class="text-xs text-slate-400">{{ '@' }}{{ m.author }}</span>
                            }
                          </div>
                          <div class="flex items-center gap-2 flex-shrink-0">
                            <span class="text-xs text-muted">{{ m.publishedAt | date:'dd/MM/yy HH:mm' }}</span>
                            <button (click)="$event.stopPropagation(); deleteMention(m.id)"
                              class="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all text-xs">✕</button>
                          </div>
                        </div>
                        <p class="text-sm text-slate-300 leading-relaxed line-clamp-3">{{ m.content }}</p>
                        @if (m.sourceUrl) {
                          <a [href]="m.sourceUrl" target="_blank" (click)="$event.stopPropagation()"
                            class="text-xs text-primary hover:underline mt-2 block truncate transition-colors">
                            🔗 {{ m.sourceUrl }}
                          </a>
                        }
                        <div class="flex items-center gap-3 mt-2 flex-wrap">
                          @if (m.reach) {
                            <span class="text-xs text-muted">👁 {{ formatReach(m.reach) }} alcance</span>
                            @if (m.engagement) { <span class="text-xs text-muted">💬 {{ formatReach(m.engagement) }} eng.</span> }
                          }
                          @if (m.commentsCount) {
                            <span class="text-xs text-muted ml-auto">💬 {{ m.commentsCount }} comentarios →</span>
                          }
                        </div>
                      </div>
                    }
                  </div>
                  <!-- Pagination -->
                  @if (totalPages() > 1) {
                    <div class="flex items-center justify-between pt-2">
                      <button (click)="prevPage()" [disabled]="page() === 1" class="btn-secondary py-1.5 px-4 text-sm">‹ Anterior</button>
                      <span class="text-sm text-muted">{{ page() }} / {{ totalPages() }}</span>
                      <button (click)="nextPage()" [disabled]="page() === totalPages()" class="btn-secondary py-1.5 px-4 text-sm">Siguiente ›</button>
                    </div>
                  }
                }
              </div>
            }

            <!-- ═══ ANALYSIS TAB ═══ -->
            @if (activeTab() === 'analysis') {
              <div class="space-y-6">

                <!-- Charts row -->
                <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <!-- Timeseries -->
                  <div class="xl:col-span-2 card p-5">
                    <div class="flex items-center justify-between mb-5">
                      <h3 class="text-sm font-semibold text-slate-200">Menciones en el tiempo</h3>
                      <div class="flex items-center gap-1 bg-surface border border-surface-border rounded-lg p-1">
                        @for (iv of intervals; track iv.value) {
                          <button (click)="setInterval(iv.value)"
                            class="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                            [class.bg-surface-hover]="interval() === iv.value"
                            [class.text-slate-200]="interval() === iv.value"
                            [class.text-muted]="interval() !== iv.value">
                            {{ iv.label }}
                          </button>
                        }
                      </div>
                    </div>
                    <div class="h-52 flex items-end gap-1 px-2 overflow-x-auto">
                      @if (timeseries().length === 0) {
                        <div class="w-full flex items-center justify-center text-muted text-sm">Sin datos en este período</div>
                      } @else {
                        @for (bar of chartBars(); track bar.label) {
                          <div class="flex-1 min-w-[14px] sm:min-w-0 flex flex-col items-center gap-1 group cursor-default" [title]="bar.label + ': ' + bar.value">
                            <span class="text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity">{{ bar.value }}</span>
                            <div class="w-full rounded-t-sm transition-all duration-300 bg-gradient-to-t from-primary to-accent/70"
                              [style.height.%]="bar.heightPct" style="min-height:2px;max-height:100%;"></div>
                            <span class="text-[10px] text-muted truncate max-w-full px-1">{{ bar.shortLabel }}</span>
                          </div>
                        }
                      }
                    </div>
                  </div>

                  <!-- Sentiment donut -->
                  <div class="card p-5">
                    <h3 class="text-sm font-semibold text-slate-200 mb-5">Distribución sentimiento</h3>
                    <div class="flex flex-col items-center gap-4">
                      <div class="relative w-36 h-36">
                        <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1a1a2e" stroke-width="3"/>
                          @for (seg of donutSegments(); track seg.label) {
                            <circle cx="18" cy="18" r="15.5" fill="none"
                              [attr.stroke]="seg.color" stroke-width="3"
                              [attr.stroke-dasharray]="seg.dash"
                              [attr.stroke-dashoffset]="seg.offset"
                              stroke-linecap="round"/>
                          }
                        </svg>
                        <div class="absolute inset-0 flex flex-col items-center justify-center">
                          <span class="text-xl font-bold text-slate-100">{{ summary()?.total ?? 0 }}</span>
                          <span class="text-xs text-muted">total</span>
                        </div>
                      </div>
                      <div class="w-full space-y-2">
                        @for (seg of donutSegments(); track seg.label) {
                          <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                              <div class="w-2.5 h-2.5 rounded-full" [style.background]="seg.color"></div>
                              <span class="text-xs text-slate-300">{{ seg.label }}</span>
                            </div>
                            <span class="text-xs font-medium text-slate-200">{{ seg.value }} <span class="text-muted">({{ seg.pct }}%)</span></span>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Source breakdown -->
                <div class="card p-5">
                  <h3 class="text-sm font-semibold text-slate-200 mb-4">Menciones por fuente</h3>
                  @if (sourceBreakdown().length === 0) {
                    <p class="text-muted text-sm text-center py-4">Sin datos</p>
                  } @else {
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      @for (src of sourceBreakdown(); track src.source) {
                        <div class="bg-surface-hover rounded-lg p-3">
                          <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-medium text-slate-200">{{ src.source }}</span>
                            <span class="text-sm font-bold text-primary">{{ src.count | number }}</span>
                          </div>
                          <div class="h-1.5 bg-surface rounded-full overflow-hidden">
                            <div class="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500" [style.width.%]="src.pct"></div>
                          </div>
                          <div class="text-xs text-muted mt-1">{{ src.pct }}% del total</div>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Top mentions -->
                @if (summary()?.topMentions?.length) {
                  <div class="card p-5">
                    <h3 class="text-sm font-semibold text-slate-200 mb-4">Menciones destacadas por alcance</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      @for (m of summary()!.topMentions!.slice(0, 6); track m.id) {
                        <div class="p-4 rounded-lg bg-surface-hover border border-surface-border/50">
                          <div class="flex items-center gap-2 mb-2">
                            <span class="badge text-[10px]"
                              [class.badge-positive]="m.sentiment === 'POSITIVE'"
                              [class.badge-negative]="m.sentiment === 'NEGATIVE'"
                              [class.badge-neutral]="m.sentiment === 'NEUTRAL'">{{ m.sentiment }}</span>
                            <span class="text-[10px] text-muted font-mono ml-auto">{{ formatReach(m.reach) }} ↑</span>
                          </div>
                          <p class="text-xs text-slate-300 line-clamp-3 leading-relaxed">{{ m.content }}</p>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }

            <!-- ═══ PRUEBA DE SCRAPER ═══ -->
            @if (activeTab() === 'scraper-test') {
              <app-scraper-test [campaignId]="selectedCampaignId" [keywordOptions]="keywordsActivas()" />
            }

            <!-- ═══ CALENDARIO DE ACTIVIDAD ═══ -->
            @if (activeTab() === 'analysis' && heatmapData().length > 0) {
              <div class="card p-4 sm:p-5 mt-6">
                <h3 class="text-sm font-semibold text-slate-200 mb-4">Calendario de menciones — últimas 18 semanas</h3>
                <app-mentions-heatmap [mentions]="heatmapData()" />
              </div>
            }

            <!-- ═══ KEYWORDS TAB ═══ -->
            @if (activeTab() === 'keywords') {
              <div class="space-y-6">

                <!-- Keywords list -->
                <div class="card p-5">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-sm font-semibold text-slate-200">Palabras clave activas</h3>
                    <button (click)="openAddKeyword()" class="btn-primary text-sm py-1.5 px-4">+ Agregar</button>
                  </div>
                  @if (keywords().length === 0) {
                    <div class="flex flex-col items-center justify-center py-12 text-muted">
                      <span class="text-2xl mb-2">🔑</span>
                      <p class="text-sm">Sin palabras clave. Agregá la primera.</p>
                    </div>
                  } @else {
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      @for (kw of keywords(); track kw.id) {
                        <div class="group px-4 py-3 rounded-lg bg-surface-hover border border-surface-border transition-colors"
                          [class.opacity-50]="kw.isActive === false">
                          <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-3 min-w-0">
                              <div class="w-3 h-3 rounded-full flex-shrink-0" [style.background]="kw.color"></div>
                              <div class="min-w-0">
                                <p class="text-sm font-medium text-slate-200 truncate">{{ kw.term }}</p>
                                <p class="text-xs text-muted">
                                  {{ kw._count?.mentions ?? 0 }} menciones
                                  @if (kw.isActive === false) {
                                    <span class="text-warning"> · pausada</span>
                                  }
                                </p>
                              </div>
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0">
                              <button (click)="toggleKeywordActive(kw)"
                                [title]="kw.isActive === false ? 'Reactivar: volver a buscar esta palabra' : 'Pausar: dejar de buscar esta palabra'"
                                class="text-xs w-7 h-7 rounded-lg border border-surface-border text-muted hover:text-slate-100 hover:bg-surface transition-colors">
                                {{ kw.isActive === false ? '▶' : '⏸' }}
                              </button>
                              <button (click)="openEditKeywordTags(kw)" title="Editar etiquetas"
                                class="text-xs w-7 h-7 rounded-lg border border-surface-border text-muted hover:text-slate-100 hover:bg-surface transition-colors">🏷</button>
                              <button (click)="deleteKeyword(kw.id)" title="Eliminar"
                                class="text-xs w-7 h-7 rounded-lg border border-surface-border text-muted hover:text-danger hover:bg-danger/10 transition-colors">✕</button>
                            </div>
                          </div>
                          @if (kw.tags?.length) {
                            <div class="flex flex-wrap gap-1 mt-2">
                              @for (t of kw.tags; track t) {
                                <span class="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25 text-accent text-[10px]">{{ t }}</span>
                              }
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Source breakdown in keywords tab -->
                @if (sourceBreakdown().length > 0) {
                  <div class="card p-5">
                    <h3 class="text-sm font-semibold text-slate-200 mb-4">Menciones por fuente</h3>
                    <div class="space-y-3">
                      @for (src of sourceBreakdown(); track src.source) {
                        <div class="flex items-center gap-3">
                          <span class="text-xs text-muted w-24 truncate">{{ src.source }}</span>
                          <div class="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                            <div class="h-full rounded-full bg-gradient-to-r from-primary to-accent" [style.width.%]="src.pct"></div>
                          </div>
                          <span class="text-xs font-medium text-slate-300 w-12 text-right">{{ src.count | number }}</span>
                          <span class="text-xs text-muted w-8 text-right">{{ src.pct }}%</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }

          </div>
        }
      </div>
    </div>

    <!-- Mention Detail Modal -->
    @if (selectedMention()) {
      <div class="modal-overlay" (click)="selectedMention.set(null)">
        <div class="modal-box max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-start justify-between gap-3 mb-4 flex-shrink-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="badge text-[10px] font-mono px-2 py-0.5"
                [class.badge-positive]="selectedMention()!.sentiment === 'POSITIVE'"
                [class.badge-negative]="selectedMention()!.sentiment === 'NEGATIVE'"
                [class.badge-neutral]="selectedMention()!.sentiment === 'NEUTRAL'">
                {{ selectedMention()!.sentiment }}
              </span>
              <span class="text-[10px] text-muted font-semibold uppercase tracking-wider">{{ selectedMention()!.source }}</span>
              @if (selectedMention()!.author) {
                <span class="text-xs text-slate-400">{{ '@' }}{{ selectedMention()!.author }}</span>
              }
              <span class="text-xs text-muted">{{ selectedMention()!.publishedAt | date:'dd/MM/yyyy HH:mm' }}</span>
            </div>
            <button (click)="selectedMention.set(null)" class="text-muted hover:text-slate-300 text-lg leading-none flex-shrink-0">✕</button>
          </div>

          <!-- Scrollable body -->
          <div class="overflow-y-auto flex-1 space-y-4 pr-1">
            <!-- Full content -->
            <p class="text-sm text-slate-300 leading-relaxed">{{ selectedMention()!.content }}</p>

            @if (selectedMention()!.sourceUrl) {
              <a [href]="selectedMention()!.sourceUrl" target="_blank"
                class="text-xs text-primary hover:underline block truncate">
                🔗 {{ selectedMention()!.sourceUrl }}
              </a>
            }

            <!-- Top 3 palabras -->
            @if (mentionTopWords().length > 0) {
              <div class="bg-surface-hover rounded-xl p-4">
                <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Top palabras del post</p>
                <div class="flex gap-2 flex-wrap">
                  @for (w of mentionTopWords(); track w.word) {
                    <span class="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-medium">
                      {{ w.word }} <span class="opacity-60">×{{ w.count }}</span>
                    </span>
                  }
                </div>
              </div>
            }

            <!-- Comments section -->
            @if (selectedMention()!.comments?.length > 0) {
              <div class="border-t border-surface-border pt-4 space-y-3">
                <!-- Comment sentiment breakdown -->
                @if (commentSentiments().length > 0) {
                  <div class="bg-surface-hover rounded-xl p-4">
                    <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Sentimiento de comentarios</p>
                    <div class="flex gap-4 flex-wrap">
                      @for (s of commentSentiments(); track s.label) {
                        <div class="flex items-center gap-2">
                          <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" [style.background]="s.color"></div>
                          <span class="text-xs text-slate-300">{{ s.label }}</span>
                          <span class="text-xs font-medium text-slate-200">{{ s.count }}</span>
                          <span class="text-xs text-muted">({{ s.pct }}%)</span>
                        </div>
                      }
                    </div>
                    <!-- Mini bar -->
                    <div class="flex h-1.5 rounded-full overflow-hidden mt-3 gap-px">
                      @for (s of commentSentiments(); track s.label) {
                        <div class="h-full transition-all" [style.width.%]="s.pct" [style.background]="s.color"></div>
                      }
                    </div>
                  </div>
                }

                <!-- Top palabras de comentarios -->
                @if (mentionCommentsTopWords().length > 0) {
                  <div class="bg-surface-hover rounded-xl p-4">
                    <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Top palabras en comentarios</p>
                    <div class="flex gap-2 flex-wrap">
                      @for (w of mentionCommentsTopWords(); track w.word) {
                        <span class="px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-medium">
                          {{ w.word }} <span class="opacity-60">×{{ w.count }}</span>
                        </span>
                      }
                    </div>
                  </div>
                }

                <!-- Comments list -->
                <div>
                  <p class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Comentarios ({{ selectedMention()!.comments.length }})
                  </p>
                  <div class="space-y-2">
                    @for (c of selectedMention()!.comments.slice(0, 25); track $index) {
                      <div class="bg-surface-hover rounded-lg px-3 py-2 border-l-2"
                        [style.border-color]="commentColor(c)">
                        @if (c.author) {
                          <p class="text-[10px] text-muted font-medium mb-0.5">{{ c.author }}</p>
                        }
                        <p class="text-xs text-slate-300 leading-relaxed">{{ c.text }}</p>
                      </div>
                    }
                    @if (selectedMention()!.comments.length > 25) {
                      <p class="text-xs text-muted text-center pt-1">... y {{ selectedMention()!.comments.length - 25 }} más</p>
                    }
                  </div>
                </div>
              </div>
            } @else {
              <p class="text-xs text-muted text-center py-4">Sin comentarios scraped para esta mención</p>
            }
          </div>
        </div>
      </div>
    }

    <!-- Add Keyword Modal -->
    @if (showKeywordModal()) {
      <div class="modal-overlay" (click)="showKeywordModal.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-5">Nueva palabra clave</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Término</label>
              <input type="text" [(ngModel)]="newKeyword.term" class="input" placeholder="Ej: García Morales">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Etiquetas (opcional)</label>
              <input type="text" [(ngModel)]="newKeyword.tags" class="input"
                placeholder="Ej: Rio Grande, Concejo Deliberante">
              <p class="text-xs text-muted mt-1.5 leading-relaxed">
                Acotan la búsqueda web a esa zona o tema: se corre una consulta extra
                por cada etiqueta, combinada con la palabra clave. Separalas con comas.
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Color</label>
              <div class="flex gap-2">
                @for (color of kwColors; track color) {
                  <button (click)="newKeyword.color = color"
                    class="w-7 h-7 rounded-full border-2 transition-all"
                    [style.background]="color"
                    [class.border-white]="newKeyword.color === color"
                    [class.border-transparent]="newKeyword.color !== color">
                  </button>
                }
              </div>
            </div>
          </div>
          <div class="flex gap-3 mt-6">
            <button (click)="showKeywordModal.set(false)" class="btn-secondary flex-1">Cancelar</button>
            <button (click)="saveKeyword()" class="btn-primary flex-1" [disabled]="!newKeyword.term.trim()">Guardar</button>
          </div>
        </div>
      </div>
    }

    <!-- Modal de campaña (crear y editar) -->
    @if (showCampaignModal()) {
      <div class="modal-overlay" (click)="showCampaignModal.set(false)">
        <div class="modal-box max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-5">{{ editingCampaignId() ? 'Editar campaña' : 'Nueva campaña' }}</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Nombre</label>
              <input type="text" [(ngModel)]="campaignForm.name" class="input" placeholder="Ej: Campaña Municipal 2025">
            </div>

            <!-- La zona define las búsquedas geográficas del scraper: sin ella
                 solo se busca a nivel nacional. -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Provincia</label>
                <select class="select" [(ngModel)]="campaignForm.provincia" (ngModelChange)="onProvinciaChange()">
                  <option value="">Todo el país</option>
                  @for (p of provincias; track p) {
                    <option [value]="p">{{ p }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Ciudad (opcional)</label>
                <select class="select" [(ngModel)]="campaignForm.ciudad" [disabled]="!campaignForm.provincia">
                  <option value="">Toda la provincia</option>
                  @for (c of ciudadesDisponibles(); track c) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
              </div>
            </div>
            <p class="text-xs text-muted leading-relaxed">
              💡 La zona orienta la búsqueda en portales locales, Facebook e Instagram.
              Sin provincia el sistema busca a nivel nacional.
            </p>

            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Descripción (opcional)</label>
              <input type="text" [(ngModel)]="campaignForm.description" class="input" placeholder="Descripción de la campaña">
            </div>
          </div>
          <div class="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button (click)="showCampaignModal.set(false)" class="btn-secondary flex-1">Cancelar</button>
            <button (click)="saveCampaign()" class="btn-primary flex-1" [disabled]="!campaignForm.name.trim()">
              {{ editingCampaignId() ? 'Guardar cambios' : 'Crear' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Etiquetas de una keyword -->
    @if (showTagsModal()) {
      <div class="modal-overlay" (click)="showTagsModal.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-1">Etiquetas de {{ editingKeyword()?.term }}</h2>
          <p class="text-xs text-muted mb-5 leading-relaxed">
            Las etiquetas acotan la búsqueda web a un tema o zona puntual: por cada una
            se corre una consulta extra combinándola con la palabra clave
            (ej. Martin Perez + Municipio de Río Grande). Separalas con comas.
          </p>
          <input type="text" [(ngModel)]="tagsInput" class="input"
            placeholder="Ej: Rio Grande, Municipio de Rio Grande, concejo deliberante">
          <div class="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button (click)="showTagsModal.set(false)" class="btn-secondary flex-1">Cancelar</button>
            <button (click)="saveKeywordTags()" class="btn-primary flex-1">Guardar etiquetas</button>
          </div>
        </div>
      </div>
    }

    <!-- Confirmación de borrado de campaña -->
    @if (showDeleteCampaign()) {
      <div class="modal-overlay" (click)="showDeleteCampaign.set(false)">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold mb-2">Eliminar campaña</h2>
          <p class="text-sm text-slate-300 mb-1">
            Se va a eliminar <strong>{{ activeCampaign()?.name }}</strong>.
          </p>
          <p class="text-xs text-danger mb-5">
            Esto borra también sus keywords, fuentes, alertas y las
            {{ activeCampaign()?._count?.mentions ?? 0 }} menciones guardadas. No se puede deshacer.
          </p>
          <div class="flex flex-col-reverse sm:flex-row gap-3">
            <button (click)="showDeleteCampaign.set(false)" class="btn-secondary flex-1">Cancelar</button>
            <button (click)="confirmDeleteCampaign()" class="btn-danger flex-1">Eliminar definitivamente</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  readonly socketService = inject(SocketService);
  private toast = inject(ToastService);
  private subs: Subscription[] = [];

  readonly campaigns = signal<any[]>([]);
  readonly keywords = signal<any[]>([]);
  readonly summary = signal<any>(null);
  readonly timeseries = signal<any[]>([]);
  readonly mentions = signal<any[]>([]);
  readonly loadingData = signal(true);
  readonly loadingMentions = signal(false);
  readonly liveAlert = signal<any>(null);
  readonly newMentionCount = signal(0);
  readonly showKeywordModal = signal(false);
  readonly showCampaignModal = signal(false);
  readonly activeTab = signal<'feed' | 'analysis' | 'keywords' | 'scraper-test'>('feed');
  readonly selectedMention = signal<any>(null);

  selectedCampaignId = '';
  period = signal('7d');
  interval = signal('day');
  page = signal(1);
  totalMentions = signal(0);
  filterSentiment = '';
  filterSource = '';

  newKeyword = { term: '', color: '#6366f1', tags: '' };
  readonly showTagsModal = signal(false);
  readonly editingKeyword = signal<any | null>(null);
  tagsInput = '';
  // El panel de prueba solo ofrece las activas: probar una pausada gastaría
  // Apify en algo que el scraping normal no va a buscar.
  // computed() y no un método: un método devuelve un array nuevo en cada ciclo
  // de detección de cambios, y eso re-disparaba el effect del panel en loop.
  readonly keywordsActivas = computed(() => this.keywords().filter(k => k.isActive !== false));

  readonly exportando = signal(false);
  // El calendario se alimenta de la serie diaria (un punto por dia), no de las
  // menciones crudas: traer 18 semanas de documentos seria carisimo en lecturas.
  readonly heatmapData = signal<any[]>([]);
  readonly provincias = PROVINCIAS;
  readonly editingCampaignId = signal<string | null>(null);
  readonly showDeleteCampaign = signal(false);
  campaignForm = { name: '', description: '', provincia: '', ciudad: '' };

  // Métodos, no computed(): dependen de `selectedCampaignId` y `campaignForm`,
  // que son propiedades planas atadas con ngModel, no señales. Un computed()
  // se calcularía una sola vez y nunca reaccionaría al cambio de campaña.
  ciudadesDisponibles(): string[] {
    return ciudadesDe(this.campaignForm.provincia);
  }

  activeCampaign(): any {
    return this.campaigns().find(c => c.id === this.selectedCampaignId) ?? null;
  }

  readonly kwColors = ['#6366f1', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6'];
  readonly periods = [
    { label: '24h', value: '24h' }, { label: '7d', value: '7d' }, { label: '30d', value: '30d' },
  ];
  readonly intervals = [
    { label: 'Hora', value: 'hour' }, { label: 'Día', value: 'day' }, { label: 'Semana', value: 'week' },
  ];
  readonly tabs = [
    { id: 'feed', icon: '📡', label: 'Feed en vivo' },
    { id: 'analysis', icon: '📊', label: 'Análisis' },
    { id: 'keywords', icon: '🔑', label: 'Keywords' },
    { id: 'scraper-test', icon: '🧪', label: 'Prueba' },
  ];

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalMentions() / 20)));

  readonly chartBars = computed(() => {
    const data = this.timeseries();
    if (!data.length) return [];
    const max = Math.max(...data.map(d => d.total ?? d.count ?? 0), 1);
    return data.map(d => ({
      label: d.time ?? d.date ?? d.hour ?? '',
      shortLabel: this.shortLabel(d.time ?? d.date ?? d.hour ?? ''),
      value: d.total ?? d.count ?? 0,
      heightPct: Math.max(2, ((d.total ?? d.count ?? 0) / max) * 100),
    }));
  });

  readonly donutSegments = computed(() => {
    const s = this.summary();
    if (!s) return [];
    const total = s.total || 1;
    const items = [
      { label: 'Positivo', key: 'POSITIVE', color: '#10b981' },
      { label: 'Negativo', key: 'NEGATIVE', color: '#ef4444' },
      { label: 'Neutro', key: 'NEUTRAL', color: '#475569' },
    ];
    const circ = 97.4;
    let offset = 0;
    return items.map(item => {
      const value = s.bySentiment?.[item.key] ?? 0;
      const pct = Math.round((value / total) * 100);
      const dash = `${(pct / 100) * circ} ${circ}`;
      const seg = { label: item.label, value, pct, color: item.color, dash, offset: -offset };
      offset += (pct / 100) * circ;
      return seg;
    });
  });

  readonly sourceBreakdown = computed(() => {
    const s = this.summary();
    if (!s?.bySource) return [];
    const total = s.total || 1;
    const arr: any[] = Array.isArray(s.bySource)
      ? s.bySource
      : Object.entries(s.bySource).map(([source, count]) => ({ source, count }));
    return arr
      .sort((a, b) => b.count - a.count)
      .map(item => ({ source: item.source, count: item.count, pct: Math.round((item.count / total) * 100) }));
  });

  readonly mentionTopWords = computed(() => (this.selectedMention()?.topWords ?? []).slice(0, 3));
  readonly mentionCommentsTopWords = computed(() => (this.selectedMention()?.commentsTopWords ?? []).slice(0, 5));

  private static readonly POS_WORDS = new Set([
    'bueno','bien','excelente','genial','bravo','feliz','gracias','apoyo','apoya','perfecto',
    'brillante','mejor','adelante','lindo','hermoso','grande','crack','gano','gana','ganamos',
    'correcto','justo','honesto','admiro','respeto','aguante','vamos',
  ]);
  private static readonly NEG_WORDS = new Set([
    'malo','mal','terrible','horrible','corrupto','corrupcion','robo','vergüenza','vergonzoso',
    'mentira','mentiroso','nefasto','desastre','traidor','ladron','mafioso','fracaso',
    'pelotudo','boludo','idiota','basura','asco','pesimo','pésimo','inutil','chorro','roba',
  ]);

  // El backend analiza el sentimiento de cada comentario al guardarlo (ver
  // orchestrator.analyzeComments). Se usa ese valor; la lista de palabras de
  // abajo es solo respaldo para comentarios viejos guardados sin el.
  private sentimentOf(c: MentionComment): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
    if (c.sentiment === 'POSITIVE' || c.sentiment === 'NEGATIVE' || c.sentiment === 'NEUTRAL') {
      return c.sentiment;
    }
    const words = (c.text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\W+/);
    const hasPos = words.some(w => DashboardComponent.POS_WORDS.has(w));
    const hasNeg = words.some(w => DashboardComponent.NEG_WORDS.has(w));
    if (hasPos && !hasNeg) return 'POSITIVE';
    if (hasNeg && !hasPos) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  readonly commentSentiments = computed(() => {
    const comments: MentionComment[] = this.selectedMention()?.comments ?? [];
    if (!comments.length) return [];

    let pos = 0, neg = 0, neu = 0;
    for (const c of comments) {
      const s = this.sentimentOf(c);
      if (s === 'POSITIVE') pos++;
      else if (s === 'NEGATIVE') neg++;
      else neu++;
    }
    const total = comments.length;
    return [
      { label: 'Positivo', color: '#10b981', count: pos, pct: Math.round((pos / total) * 100) },
      { label: 'Negativo', color: '#ef4444', count: neg, pct: Math.round((neg / total) * 100) },
      { label: 'Neutro',   color: '#475569', count: neu, pct: Math.round((neu / total) * 100) },
    ].filter(s => s.count > 0);
  });

  commentColor(c: MentionComment): string {
    const s = this.sentimentOf(c);
    if (s === 'NEGATIVE') return '#ef4444';
    if (s === 'POSITIVE') return '#10b981';
    return '#334155';
  }

  ngOnInit() {
    this.loadCampaigns();
    this.subs.push(
      this.socketService.newMentions$.subscribe(ev => {
        this.newMentionCount.update(n => n + ev.count);
        this.loadSummary();
      }),
      this.socketService.alert$.subscribe(ev => this.liveAlert.set(ev)),
    );
  }

  ngOnDestroy() { this.subs.forEach(s => s.unsubscribe()); }

  setTab(tab: string) {
    this.activeTab.set(tab as 'feed' | 'analysis' | 'keywords' | 'scraper-test');
    if (tab === 'feed') this.newMentionCount.set(0);
  }

  loadCampaigns() {
    this.api.getCampaigns().subscribe({
      next: data => {
        this.campaigns.set(data);
        if (data.length > 0) {
          // Recargar la lista (por ejemplo al guardar una campaña) no debe
          // patear al usuario de vuelta a la primera: se conserva la que tenía
          // seleccionada si sigue existiendo.
          const sigueExistiendo = data.some((c: any) => c.id === this.selectedCampaignId);
          if (!sigueExistiendo) this.selectedCampaignId = data[0].id;
          this.onCampaignChange();
        } else {
          this.selectedCampaignId = '';
          this.loadingData.set(false);
        }
      },
      error: () => this.loadingData.set(false),
    });
  }

  onCampaignChange() {
    if (!this.selectedCampaignId) return;
    this.socketService.joinCampaign(this.selectedCampaignId);
    this.loadingData.set(true);
    this.newMentionCount.set(0);
    Promise.all([
      new Promise(r => this.api.getKeywords(this.selectedCampaignId, true).subscribe({ next: d => { this.keywords.set(d); r(null); }, error: () => r(null) })),
      new Promise(r => this.loadSummaryP().then(r)),
      new Promise(r => this.loadTimeseriesP().then(r)),
      new Promise(r => { this.loadHeatmap(); r(null); }),
    ]).finally(() => {
      this.loadingData.set(false);
      this.loadMentions();
    });
  }

  private normalizeSummary(raw: any): any {
    const total = raw.mentions?.total ?? raw.total ?? 0;
    const delta = raw.mentions?.delta ?? raw.delta ?? 0;
    const bySentiment: Record<string, number> = {};
    const bySentimentRaw = raw.bySentiment ?? [];
    if (Array.isArray(bySentimentRaw)) {
      bySentimentRaw.forEach((x: any) => { bySentiment[x.sentiment] = x.count; });
    } else {
      Object.assign(bySentiment, bySentimentRaw);
    }
    return { ...raw, total, delta, bySentiment };
  }

  loadSummary() {
    this.api.getAnalyticsSummary(this.selectedCampaignId, this.period()).subscribe({
      next: d => this.summary.set(this.normalizeSummary(d)),
    });
  }
  private loadSummaryP(): Promise<void> {
    return new Promise(r => this.api.getAnalyticsSummary(this.selectedCampaignId, this.period()).subscribe({
      next: d => { this.summary.set(this.normalizeSummary(d)); r(); }, error: () => r(),
    }));
  }
  private loadTimeseriesP(): Promise<void> {
    return new Promise(r => this.api.getTimeseries(this.selectedCampaignId, this.period(), this.interval()).subscribe({
      next: d => { this.timeseries.set(d.series ?? d.data ?? (Array.isArray(d) ? d : [])); r(); }, error: () => r(),
    }));
  }

  loadMentions() {
    if (!this.selectedCampaignId) return;
    this.loadingMentions.set(true);
    this.api.getMentions({
      campaignId: this.selectedCampaignId,
      page: this.page(),
      limit: 20,
      sentiment: this.filterSentiment || undefined,
      source: this.filterSource || undefined,
    }).subscribe({
      next: d => {
        this.mentions.set(d.mentions ?? d.data ?? (Array.isArray(d) ? d : []));
        this.totalMentions.set(d.pagination?.total ?? d.total ?? d.mentions?.length ?? 0);
        this.loadingMentions.set(false);
      },
      error: () => this.loadingMentions.set(false),
    });
  }

  onFilterChange() { this.page.set(1); this.loadMentions(); }

  refreshFeed() { this.newMentionCount.set(0); this.page.set(1); this.loadMentions(); }

  setPeriod(p: string) { this.period.set(p); this.loadSummary(); this.loadTimeseriesP(); }
  setInterval(iv: string) { this.interval.set(iv); this.loadTimeseriesP(); }

  prevPage() { if (this.page() > 1) { this.page.update(p => p - 1); this.loadMentions(); } }
  nextPage() { if (this.page() < this.totalPages()) { this.page.update(p => p + 1); this.loadMentions(); } }

  deleteMention(id: string) {
    this.api.deleteMention(id).subscribe({
      next: () => { this.mentions.update(ms => ms.filter(m => m.id !== id)); this.toast.success('Mención eliminada'); },
      error: () => this.toast.error('Error al eliminar'),
    });
  }

  openAddKeyword() { this.newKeyword = { term: '', color: '#6366f1', tags: '' }; this.showKeywordModal.set(true); }

  openEditKeywordTags(kw: any) {
    this.editingKeyword.set(kw);
    this.tagsInput = (kw.tags ?? []).join(', ');
    this.showTagsModal.set(true);
  }

  saveKeywordTags() {
    const kw = this.editingKeyword();
    if (!kw) return;
    // El backend normaliza (normalizeTags): acepta el texto separado por comas.
    this.api.updateKeyword(kw.id, { tags: this.tagsInput }).subscribe({
      next: () => {
        this.showTagsModal.set(false);
        this.toast.success('Etiquetas actualizadas');
        this.reloadKeywords();
      },
      error: () => this.toast.error('Error al guardar las etiquetas'),
    });
  }

  // Pausar una keyword la saca del scraping sin borrar su histórico.
  toggleKeywordActive(kw: any) {
    const next = kw.isActive === false;
    this.api.updateKeyword(kw.id, { isActive: next }).subscribe({
      next: () => {
        this.toast.success(next ? kw.term + ' reactivada' : kw.term + ' pausada');
        this.reloadKeywords();
      },
      error: () => this.toast.error('Error al cambiar el estado'),
    });
  }

  // includeInactive: el panel tiene que mostrar las pausadas para poder
  // reactivarlas. El resto del dashboard sigue viendo solo las activas.

  // Trae TODAS las menciones que matchean los filtros actuales (no solo la
  // pagina visible) y las baja con contenido completo y comentarios.
  loadHeatmap() {
    if (!this.selectedCampaignId) { this.heatmapData.set([]); return; }
    this.api.getTimeseries(this.selectedCampaignId, '180d', 'day').subscribe({
      next: (r: any) => {
        const serie = r?.series ?? [];
        // El heatmap cuenta una mencion por elemento, asi que se expande cada
        // bucket diario a `total` entradas con esa fecha.
        const expandido: any[] = [];
        for (const punto of serie) {
          for (let i = 0; i < (punto.total ?? 0); i++) expandido.push({ publishedAt: punto.time });
        }
        this.heatmapData.set(expandido);
      },
      error: () => this.heatmapData.set([]),
    });
  }

  exportarMenciones(formato: 'xlsx' | 'txt') {
    if (!this.selectedCampaignId || this.exportando()) return;
    this.exportando.set(true);

    this.api.getMentions({
      campaignId: this.selectedCampaignId,
      page: 1,
      limit: 5000,
      sentiment: this.filterSentiment || undefined,
      source: this.filterSource || undefined,
    }).subscribe({
      next: (d: any) => {
        const todas = d.mentions ?? [];
        this.exportando.set(false);
        if (todas.length === 0) {
          this.toast.error('No hay menciones para descargar con estos filtros');
          return;
        }
        const nombre = this.activeCampaign()?.name ?? 'campana';
        const base = `menciones_${nombre}_${stamp()}`;
        if (formato === 'xlsx') downloadMentionsXLSX(todas, `${base}.xlsx`);
        else downloadMentionsTXT(todas, `${base}.txt`, `Menciones — ${nombre}`);
        this.toast.success(`${todas.length} menciones descargadas`);
      },
      error: () => {
        this.exportando.set(false);
        this.toast.error('Error al exportar las menciones');
      },
    });
  }

  reloadKeywords() {
    this.api.getKeywords(this.selectedCampaignId, true).subscribe({
      next: d => this.keywords.set(d),
      error: () => {},
    });
  }
  saveKeyword() {
    if (!this.newKeyword.term.trim()) return;
    this.api.createKeyword({ ...this.newKeyword, campaignId: this.selectedCampaignId }).subscribe({
      next: () => {
        this.showKeywordModal.set(false);
        this.toast.success('Palabra clave agregada');
        this.reloadKeywords();
      },
      error: () => this.toast.error('Error al agregar la palabra clave'),
    });
  }
  deleteKeyword(id: string) {
    this.api.deleteKeyword(id).subscribe({
      next: () => { this.keywords.update(ks => ks.filter(k => k.id !== id)); this.toast.success('Eliminada'); },
      error: () => this.toast.error('Error al eliminar'),
    });
  }

  openCreateCampaign() {
    this.editingCampaignId.set(null);
    this.campaignForm = { name: '', description: '', provincia: '', ciudad: '' };
    this.showCampaignModal.set(true);
  }

  openEditCampaign() {
    const c = this.activeCampaign();
    if (!c) return;
    this.editingCampaignId.set(c.id);
    // El backend manda provincia/ciudad ya desempaquetadas del description.
    this.campaignForm = {
      name: c.name ?? '',
      description: c.descriptionText ?? '',
      provincia: c.provincia ?? '',
      ciudad: c.ciudad ?? '',
    };
    this.showCampaignModal.set(true);
  }

  // Cambiar de provincia invalida la ciudad elegida: dejarla puesta mandaria
  // una ciudad que no pertenece a esa provincia.
  onProvinciaChange() {
    if (!this.ciudadesDisponibles().includes(this.campaignForm.ciudad)) {
      this.campaignForm.ciudad = '';
    }
  }

  saveCampaign() {
    if (!this.campaignForm.name.trim()) return;
    const id = this.editingCampaignId();
    const payload = { ...this.campaignForm };
    const req = id ? this.api.updateCampaign(id, payload) : this.api.createCampaign(payload);

    req.subscribe({
      next: (res: any) => {
        this.showCampaignModal.set(false);
        this.toast.success(id ? 'Campaña actualizada' : 'Campaña creada');
        const created = res?.campaign ?? res;
        if (!id && created?.id) this.selectedCampaignId = created.id;
        this.loadCampaigns();
      },
      error: () => this.toast.error(id ? 'Error al actualizar la campaña' : 'Error al crear campaña'),
    });
  }

  confirmDeleteCampaign() {
    const c = this.activeCampaign();
    if (!c) return;
    this.api.deleteCampaign(c.id).subscribe({
      next: () => {
        this.showDeleteCampaign.set(false);
        this.toast.success('Campaña eliminada');
        this.selectedCampaignId = '';
        this.loadCampaigns();
      },
      error: () => this.toast.error('Error al eliminar la campaña'),
    });
  }

  sentimentPct(key: string): number {
    const s = this.summary();
    if (!s?.total) return 0;
    return Math.round(((s.bySentiment?.[key] ?? 0) / s.total) * 100);
  }

  formatReach(n: number | undefined): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  shortLabel(s: string): string {
    if (!s) return '';
    if (s.length <= 5) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      if (this.interval() === 'hour') return d.getHours() + 'h';
      return (d.getMonth() + 1) + '/' + d.getDate();
    }
    return s.slice(-4);
  }
}
