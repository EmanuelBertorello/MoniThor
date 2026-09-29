import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-analyzer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full">
      <header class="px-6 py-4 border-b border-surface-border bg-surface/80 backdrop-blur-sm sticky top-0 z-30">
        <h1 class="text-lg font-semibold text-slate-100">Analizador de URL</h1>
        <p class="text-muted text-xs mt-0.5">Analizá el sentimiento de cualquier página web o artículo</p>
      </header>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl mx-auto w-full min-w-0">
        <!-- Input -->
        <div class="card p-6">
          <label class="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">URL a analizar</label>
          <div class="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              [(ngModel)]="url"
              (keydown.enter)="analyze()"
              class="input flex-1"
              placeholder="https://www.infobae.com/politica/..."
            >
            <button (click)="analyze()" [disabled]="!url || loading()" class="btn-primary px-6 flex-shrink-0 flex items-center gap-2">
              @if (loading()) {
                <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              }
              Analizar
            </button>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            @for (example of examples; track example) {
              <button (click)="url = example" class="text-xs text-primary hover:text-primary-light transition-colors truncate max-w-xs">
                ↳ {{ example }}
              </button>
            }
          </div>
        </div>

        <!-- Result -->
        @if (loading()) {
          <div class="card p-6 sm:p-8 flex flex-col items-center gap-4">
            <div class="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            <div class="text-center">
              <p class="text-slate-200 font-medium">Analizando contenido...</p>
              <p class="text-muted text-sm mt-1">Extrayendo texto y procesando con IA</p>
            </div>
          </div>
        }

        @if (result() && !loading()) {
          <div class="space-y-4 animate-slide-up">
            <!-- Sentiment banner -->
            <div class="card p-6 flex items-center gap-5"
              [ngClass]="sentimentBorderClass(result()!.sentiment)">
              <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                [ngClass]="sentimentBgClass(result()!.sentiment)">
                {{ sentimentEmoji(result()!.sentiment) }}
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-3 flex-wrap">
                  <h2 class="text-xl font-bold"
                    [class.text-success]="result()!.sentiment === 'POSITIVE'"
                    [class.text-danger]="result()!.sentiment === 'NEGATIVE'"
                    [class.text-muted]="result()!.sentiment === 'NEUTRAL'">
                    {{ sentimentLabel(result()!.sentiment) }}
                  </h2>
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-24 sm:w-32 bg-surface-border rounded-full overflow-hidden flex-shrink-0">
                      <div class="h-full rounded-full transition-all"
                        [style.width.%]="scoreWidth(result()!.score)"
                        [class.bg-success]="result()!.sentiment === 'POSITIVE'"
                        [class.bg-danger]="result()!.sentiment === 'NEGATIVE'"
                        [class.bg-muted]="result()!.sentiment === 'NEUTRAL'">
                      </div>
                    </div>
                    <span class="text-sm text-muted font-mono">{{ result()!.score | number:'1.2-2' }}</span>
                  </div>
                </div>
                @if (result()!.url) {
                  <a [href]="result()!.url" target="_blank" class="text-xs text-primary hover:text-primary-light transition-colors mt-1 block truncate">
                    {{ result()!.url }}
                  </a>
                }
                @if (result()!.title) {
                  <p class="text-sm text-slate-300 mt-1 font-medium">{{ result()!.title }}</p>
                }
              </div>
            </div>

            <!-- Content preview -->
            @if (result()!.content) {
              <div class="card p-5">
                <h3 class="text-sm font-semibold text-slate-200 mb-3">Contenido extraído</h3>
                <p class="text-sm text-slate-300 leading-relaxed line-clamp-6">{{ result()!.content }}</p>
              </div>
            }

            <!-- Metadata -->
            @if (result()!.meta) {
              <div class="card p-5">
                <h3 class="text-sm font-semibold text-slate-200 mb-3">Metadatos</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  @for (entry of metaEntries(); track entry.key) {
                    <div>
                      <span class="text-xs text-muted uppercase tracking-wider">{{ entry.key }}</span>
                      <p class="text-sm text-slate-200 mt-0.5">{{ entry.value }}</p>
                    </div>
                  }
                </div>
              </div>
            }

            <button (click)="result.set(null)" class="btn-secondary text-sm">Limpiar</button>
          </div>
        }

        @if (error()) {
          <div class="card p-6 border-danger/30 animate-fade-in">
            <div class="flex items-center gap-3">
              <span class="text-danger text-2xl">✕</span>
              <div>
                <p class="text-danger font-medium">Error al analizar</p>
                <p class="text-sm text-muted mt-0.5">{{ error() }}</p>
              </div>
            </div>
            <button (click)="error.set(null)" class="btn-secondary text-xs mt-4">Cerrar</button>
          </div>
        }
      </div>
    </div>
  `,
})
export class AnalyzerComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  url = '';
  readonly loading = signal(false);
  readonly result = signal<any>(null);
  readonly error = signal<string | null>(null);

  readonly examples = [
    'https://www.infobae.com',
    'https://www.lanacion.com.ar',
    'https://www.clarin.com',
  ];

  metaEntries() {
    const meta = this.result()?.meta;
    if (!meta) return [];
    return Object.entries(meta).filter(([, v]) => v).map(([key, value]) => ({ key, value: String(value) }));
  }

  analyze() {
    if (!this.url) return;
    this.loading.set(true);
    this.result.set(null);
    this.error.set(null);
    this.api.analyzeUrl(this.url).subscribe({
      next: r => { this.result.set(r); this.loading.set(false); },
      error: e => {
        this.error.set(e?.error?.error ?? 'No se pudo analizar la URL.');
        this.loading.set(false);
      },
    });
  }

  sentimentEmoji(s: string): string {
    return { POSITIVE: '▲', NEGATIVE: '▼', NEUTRAL: '◎' }[s] ?? '◎';
  }
  sentimentLabel(s: string): string {
    return { POSITIVE: 'Positivo', NEGATIVE: 'Negativo', NEUTRAL: 'Neutro' }[s] ?? s;
  }
  scoreWidth(score: number): number {
    return Math.abs(score ?? 0) * 100;
  }

  sentimentBorderClass(s: string): Record<string, boolean> {
    return {
      'border-success': s === 'POSITIVE',
      'border-danger': s === 'NEGATIVE',
      'border-muted': s === 'NEUTRAL',
    };
  }

  sentimentBgClass(s: string): Record<string, boolean> {
    return {
      'bg-success/10': s === 'POSITIVE',
      'bg-danger/10': s === 'NEGATIVE',
      'bg-muted/10': s === 'NEUTRAL',
    };
  }
}
