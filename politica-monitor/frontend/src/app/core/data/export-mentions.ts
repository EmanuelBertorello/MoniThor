// Exporta menciones a Excel o TXT con todo lo que se ve en la web: contenido
// completo, comentarios con su sentimiento, autor, alcance y engagement.
import * as XLSX from 'xlsx';

function fecha(valor: any): string {
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

// El backend normaliza los comentarios a `comments` ({text, sentiment}); se
// acepta también `commentsList` para menciones traídas de otro endpoint.
function listaComentarios(m: any): { text: string; sentiment?: string | null }[] {
  if (Array.isArray(m.comments) && m.comments.length) return m.comments;
  if (Array.isArray(m.commentsList)) return m.commentsList;
  return [];
}

function resumenComentarios(m: any): string {
  const list = listaComentarios(m);
  if (!list.length) return '';
  return list
    .map(c => `[${c.sentiment || '?'}] ${(c.text || '').replace(/\s+/g, ' ').trim()}`)
    .join(' | ');
}

export function mentionRow(m: any): Record<string, any> {
  const comentarios = listaComentarios(m);
  return {
    Fecha: fecha(m.publishedAt),
    Fuente: m.source,
    'Página/Autor': m.sourceName || m.author || '',
    'Palabra clave': m.keyword?.term || '',
    Sentimiento: m.sentiment,
    Alcance: m.reach || 0,
    Engagement: m.engagement || 0,
    'Comentarios en el post': m.extra?.commentsCount ?? '',
    'Comentarios traídos': comentarios.length,
    Leído: m.isRead ? 'Sí' : 'No',
    Contenido: m.content || '',
    URL: m.sourceUrl || '',
    Comentarios: resumenComentarios(m),
  };
}

function descargar(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function downloadMentionsXLSX(mentions: any[], filename: string, sheetName = 'Menciones') {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(mentions.map(mentionRow));
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  XLSX.writeFile(wb, filename);
}

export function downloadMentionsTXT(mentions: any[], filename: string, title: string) {
  const sep = '═'.repeat(60);
  const sep2 = '─'.repeat(60);
  const lines: string[] = [
    sep,
    `  ${title}`,
    `  Generado: ${fecha(new Date())} · ${mentions.length} menciones`,
    sep,
    '',
  ];

  mentions.forEach((m, i) => {
    lines.push(`${i + 1}. [${m.source}] ${fecha(m.publishedAt)}${m.keyword ? ` | Palabra clave: ${m.keyword.term}` : ''}`);
    lines.push(`   Página/Autor: ${m.sourceName || m.author || '—'} | Sentimiento: ${m.sentiment} | Alcance: ${m.reach || 0} | Engagement: ${m.engagement || 0}`);
    lines.push(`   ${(m.content || '').replace(/\n/g, ' ')}`);
    if (m.sourceUrl) lines.push(`   URL: ${m.sourceUrl}`);

    const comentarios = listaComentarios(m);
    if (comentarios.length) {
      lines.push(`   Comentarios (${comentarios.length}):`);
      comentarios.forEach(c => lines.push(`     - [${c.sentiment || '?'}] ${(c.text || '').replace(/\n/g, ' ')}`));
    }
    lines.push(sep2);
  });

  descargar(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), filename);
}

// Sello de tiempo para el nombre del archivo: 2026-09-13_2047
export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
