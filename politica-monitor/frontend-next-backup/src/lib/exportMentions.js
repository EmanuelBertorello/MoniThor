// src/lib/exportMentions.js
// Exporta menciones a Excel/TXT con todos los campos que se ven en la web
// (contenido completo, comentarios, autor, alcance, engagement, etc).
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

function safeFormat(dateVal, pattern) {
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';
  try { return format(d, pattern); } catch { return '—'; }
}

function commentsSummary(m) {
  const list = m.commentsList || [];
  if (list.length === 0) return '';
  return list.map(c => `[${c.sentiment || '?'}] ${(c.text || '').replace(/\s+/g, ' ').trim()}`).join(' | ');
}

export function mentionRow(m) {
  return {
    Fecha: safeFormat(m.publishedAt, 'dd/MM/yyyy HH:mm'),
    Fuente: m.source,
    'Página/Autor': m.sourceName || m.author || '',
    Keyword: m.keyword?.term || '',
    Sentimiento: m.sentiment,
    Alcance: m.reach || 0,
    Engagement: m.engagement || 0,
    'Cant. comentarios (post)': m.extra?.commentsCount ?? '',
    'Comentarios traídos': (m.commentsList || []).length,
    Leído: m.isRead ? 'Sí' : 'No',
    Contenido: m.content || '',
    URL: m.sourceUrl || '',
    Comentarios: commentsSummary(m),
  };
}

export function downloadMentionsXLSX(mentions, filename, sheetName = 'Menciones') {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(mentions.map(mentionRow));
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  XLSX.writeFile(wb, filename);
}

export function downloadMentionsTXT(mentions, filename, title) {
  const sep = '═'.repeat(60);
  const sep2 = '─'.repeat(60);
  const lines = [
    sep,
    `  ${title}`,
    `  Generado: ${safeFormat(new Date(), 'dd/MM/yyyy HH:mm')} · ${mentions.length} menciones`,
    sep,
    '',
  ];
  mentions.forEach((m, i) => {
    lines.push(`${i + 1}. [${m.source}] ${safeFormat(m.publishedAt, 'dd/MM/yyyy HH:mm')}${m.keyword ? ` | Keyword: ${m.keyword.term}` : ''}`);
    lines.push(`   Página/Autor: ${m.sourceName || m.author || '—'} | Sentimiento: ${m.sentiment} | Alcance: ${m.reach || 0} | Engagement: ${m.engagement || 0}`);
    lines.push(`   ${(m.content || '').replace(/\n/g, ' ')}`);
    if (m.sourceUrl) lines.push(`   URL: ${m.sourceUrl}`);
    const comments = m.commentsList || [];
    if (comments.length > 0) {
      lines.push(`   Comentarios (${comments.length}):`);
      comments.forEach(c => lines.push(`     - [${c.sentiment || '?'}] ${(c.text || '').replace(/\n/g, ' ')}`));
    }
    lines.push(sep2);
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
