import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Dia { key: string; count: number }

// Calendario tipo "contribuciones de GitHub" con el volumen de menciones por
// día. El rango es fijo (últimas ~18 semanas) a propósito: si se ajustara a los
// datos disponibles, una campaña nueva mostraría una columnita en vez de un
// calendario y no se entendería la escala.
@Component({
  selector: 'app-mentions-heatmap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      @if (stats(); as hs) {
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div class="bg-surface-hover rounded-lg p-3">
            <p class="text-xs text-muted">Total en el rango</p>
            <p class="text-base font-bold text-slate-100">{{ hs.total | number }}</p>
          </div>
          <div class="bg-surface-hover rounded-lg p-3">
            <p class="text-xs text-muted">Días con actividad</p>
            <p class="text-base font-bold text-slate-100">{{ hs.activeDays }}</p>
          </div>
          <div class="bg-surface-hover rounded-lg p-3">
            <p class="text-xs text-muted">Promedio por día activo</p>
            <p class="text-base font-bold text-slate-100">{{ hs.avgPerActive }}</p>
          </div>
        </div>
        @if (hs.topDay) {
          <p class="text-xs text-muted mb-3">
            Día con más menciones: <strong class="text-slate-300">{{ hs.topDay.key }}</strong> ({{ hs.topDay.count }})
          </p>
        }
      }

      <div class="overflow-x-auto">
        <div class="flex gap-1 min-w-max">
          @for (week of weeks(); track $index) {
            <div class="flex flex-col gap-1">
              @for (day of week; track day.key) {
                <div class="w-3 h-3 rounded-sm cursor-default transition-all hover:ring-1 hover:ring-primary/50"
                  [title]="day.key + ': ' + day.count + ' menciones'"
                  [style.background]="color(day.count)"></div>
              }
            </div>
          }
        </div>
      </div>

      <div class="flex items-center gap-2 mt-3 text-xs text-muted">
        <span>Menos</span>
        @for (step of leyenda(); track $index) {
          <div class="w-3 h-3 rounded-sm" [style.background]="color(step)"></div>
        }
        <span>Más</span>
      </div>
    </div>
  `,
})
export class MentionsHeatmapComponent {
  readonly mentions = input<any[]>([]);
  readonly semanas = input(18);

  private readonly countByDate = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const m of this.mentions() ?? []) {
      const d = new Date(m.publishedAt ?? m.createdAt);
      if (isNaN(d.getTime())) continue;
      const key = d.toISOString().split('T')[0];
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  });

  readonly weeks = computed<Dia[][]>(() => {
    const counts = this.countByDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));   // cierra la semana actual
    const start = new Date(end);
    start.setDate(start.getDate() - 7 * (this.semanas() - 1));
    start.setDate(start.getDate() - start.getDay());   // arranca en domingo

    const weeks: Dia[][] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const week: Dia[] = [];
      for (let i = 0; i < 7; i++) {
        const key = cur.toISOString().split('T')[0];
        week.push({ key, count: counts[key] ?? 0 });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  });

  readonly stats = computed(() => {
    const days = this.weeks().flat();
    const total = days.reduce((a, d) => a + d.count, 0);
    const activeDays = days.filter(d => d.count > 0).length;
    const counts = this.countByDate();
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return {
      total,
      activeDays,
      avgPerActive: activeDays > 0 ? (total / activeDays).toFixed(1) : '0',
      max: Math.max(...Object.values(counts), 1),
      topDay: top ? { key: top[0], count: top[1] } : null,
    };
  });

  readonly leyenda = computed(() => {
    const max = this.stats().max;
    return [0, Math.ceil(max * 0.25), Math.ceil(max * 0.5), Math.ceil(max * 0.75), max];
  });

  color(count: number): string {
    if (!count) return '#1a1a2e';
    const ratio = count / this.stats().max;
    if (ratio > 0.75) return '#818cf8';
    if (ratio > 0.5) return '#6366f1';
    if (ratio > 0.25) return '#4338ca';
    return '#312e81';
  }
}
