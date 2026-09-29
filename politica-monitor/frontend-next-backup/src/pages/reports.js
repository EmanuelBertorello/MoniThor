// src/pages/reports.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { campaignsAPI, reportsAPI } from '../lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { mentionRow } from '../lib/exportMentions';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const SRC_COLORS = { WEB:'#0ea5e9', TWITTER:'#1d9bf0', FACEBOOK:'#1877f2', INSTAGRAM:'#e1306c', NEWS:'#f59e0b' };
const SRC_ICONS  = { WEB:'🌐', TWITTER:'🐦', FACEBOOK:'📘', INSTAGRAM:'📸', NEWS:'📰' };
const SENT_COLORS = { POSITIVE:'#10b981', NEGATIVE:'#ef4444', NEUTRAL:'#64748b' };

function safeFormat(dateVal, pattern) {
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';
  return format(d, pattern);
}

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
  if (n >= 1000) return (n/1000).toFixed(1)+'k';
  return String(n);
}

function dayKey(dateVal) {
  const d = new Date(dateVal);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = ['', 'Lun', '', 'Mié', '', 'Vie', ''];

// Calendario tipo GitHub: rango fijo de ~18 semanas, con labels de mes/día.
function MentionsHeatmap({ mentions }) {
  const counts = {};
  (mentions || []).forEach(m => {
    const k = dayKey(m.publishedAt);
    counts[k] = (counts[k] || 0) + 1;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - 7 * 17);
  start.setDate(start.getDate() - start.getDay());

  const days = [];
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const k = dayKey(cur);
    days.push({ key: k, date: new Date(cur), count: counts[k] || 0 });
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const monthLabels = weeks.map(week => {
    const firstOfMonth = week.find(d => d.date.getDate() <= 7);
    if (!firstOfMonth) return '';
    try { return format(firstOfMonth.date, 'MMM', { locale: es }); } catch { return ''; }
  });

  const maxCount = Math.max(1, ...Object.values(counts), 0);
  const scale = ['var(--bg3)', '#bbf7d0', '#4ade80', '#22c55e', '#166534'];
  function colorFor(count) {
    if (count === 0) return scale[0];
    const ratio = count / maxCount;
    if (ratio > 0.75) return scale[4];
    if (ratio > 0.5) return scale[3];
    if (ratio > 0.25) return scale[2];
    return scale[1];
  }

  const entries = Object.entries(counts);
  const topDay = entries.sort((a, b) => b[1] - a[1])[0];
  const totalInRange = days.reduce((a, d) => a + d.count, 0);
  const activeDays = days.filter(d => d.count > 0).length;
  const avgPerActiveDay = activeDays > 0 ? (totalInRange / activeDays).toFixed(1) : '0';

  return (
    <div className="card">
      <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'12px' }}>📅 Calendario de menciones (últimos ~4 meses)</div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'16px' }}>
        <div style={{ background:'var(--bg3)', borderRadius:'8px', padding:'10px 12px' }}>
          <div style={{ fontSize:'11px', color:'var(--text3)' }}>Total en rango</div>
          <div style={{ fontSize:'16px', fontWeight:'700' }}>{totalInRange}</div>
        </div>
        <div style={{ background:'var(--bg3)', borderRadius:'8px', padding:'10px 12px' }}>
          <div style={{ fontSize:'11px', color:'var(--text3)' }}>Días con actividad</div>
          <div style={{ fontSize:'16px', fontWeight:'700' }}>{activeDays}</div>
        </div>
        <div style={{ background:'var(--bg3)', borderRadius:'8px', padding:'10px 12px' }}>
          <div style={{ fontSize:'11px', color:'var(--text3)' }}>Promedio/día activo</div>
          <div style={{ fontSize:'16px', fontWeight:'700' }}>{avgPerActiveDay}</div>
        </div>
      </div>

      {topDay && topDay[1] > 0 && (
        <div style={{ fontSize:'12px', color:'var(--text3)', marginBottom:'14px' }}>
          Día con más menciones: <strong style={{ color:'var(--text2)' }}>{safeFormat(`${topDay[0]}T12:00:00`, 'dd/MM/yyyy')}</strong> ({topDay[1]} mención{topDay[1] !== 1 ? 'es' : ''})
        </div>
      )}

      <div style={{ display:'flex', overflowX:'auto', paddingBottom:'8px' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:'3px', marginRight:'6px', paddingTop:'16px', flexShrink:0 }}>
          {WEEKDAY_LABELS.map((l, i) => (
            <div key={i} style={{ height:'12px', fontSize:'9px', color:'var(--text3)', lineHeight:'12px' }}>{l}</div>
          ))}
        </div>
        <div>
          <div style={{ display:'flex', gap:'3px', marginBottom:'4px' }}>
            {weeks.map((w, i) => (
              <div key={i} style={{ width:'12px', fontSize:'9px', color:'var(--text3)', textTransform:'capitalize' }}>{monthLabels[i]}</div>
            ))}
          </div>
          <div style={{ display:'flex', gap:'3px' }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                {week.map((day, di) => (
                  <div key={di} title={`${day.key}: ${day.count} mención${day.count !== 1 ? 'es' : ''}`}
                    style={{ width:'12px', height:'12px', borderRadius:'2px', background: colorFor(day.count) }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'8px', fontSize:'11px', color:'var(--text3)' }}>
        Menos
        {scale.map((c, i) => <div key={i} style={{ width:'10px', height:'10px', borderRadius:'2px', background:c }} />)}
        Más
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [campaigns, setCampaigns]     = useState([]);
  const [campaignId, setCampaignId]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [reportData, setReportData]   = useState(null);
  const [pastReports, setPastReports] = useState([]);

  // Form options
  const [period, setPeriod]         = useState('24h');
  const [source, setSource]         = useState('ALL');
  const [sentiment, setSentiment]   = useState('ALL');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    campaignsAPI.list().then(r => {
      setCampaigns(r.data.campaigns);
      if (r.data.campaigns.length > 0) setCampaignId(r.data.campaigns[0].id);
    });
  }, [user]);

  useEffect(() => {
    if (!campaignId) return;
    reportsAPI.list(campaignId).then(r => setPastReports(r.data.reports || [])).catch(()=>{});
  }, [campaignId]);

  // ─── Generate report ─────────────────────────────────────────────────────
  async function generate() {
    if (!campaignId) return;
    setLoading(true);
    setReportData(null);
    try {
      const res = await reportsAPI.generate({ campaignId, period, source, sentiment });
      setReportData(res.data.data);
      downloadXLSX(res.data.data);
      toast.success('Reporte generado y descargado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al generar');
    } finally {
      setLoading(false);
    }
  }

  // ─── Download as Excel ───────────────────────────────────────────────────
  function downloadXLSX(d) {
    if (!d) return;
    const wb = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['Campaña', d.meta.campaign],
      ['Período', d.meta.period],
      ['Generado', safeFormat(d.meta.generatedAt, 'dd/MM/yyyy HH:mm')],
      [],
      ['Total menciones', d.summary.total],
      ['Variación vs período anterior (%)', d.summary.delta],
      ['Alcance total', d.summary.totalReach],
      ['Engagement total', d.summary.totalEngagement],
      [],
      ['Sentimiento', 'Menciones', '%', 'Alcance'],
      ['Positivo', d.sentiment.positive.count, d.sentiment.positive.pct, d.sentiment.positive.reach],
      ['Negativo', d.sentiment.negative.count, d.sentiment.negative.pct, d.sentiment.negative.reach],
      ['Neutral', d.sentiment.neutral.count, d.sentiment.neutral.pct, d.sentiment.neutral.reach],
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumen');

    const mentionsSheet = XLSX.utils.json_to_sheet(d.allMentions.map(mentionRow));
    XLSX.utils.book_append_sheet(wb, mentionsSheet, 'Menciones');

    XLSX.writeFile(wb, `reporte_${d.meta.campaign}_${period}.xlsx`);
  }

  // ─── Download as CSV ─────────────────────────────────────────────────────
  function downloadCSV() {
    if (!reportData) return;
    const rows = [
      ['Fecha', 'Fuente', 'Keyword', 'Sentimiento', 'Alcance', 'Engagement', 'Autor', 'URL', 'Contenido'],
      ...reportData.allMentions.map(m => [
        safeFormat(m.publishedAt, 'dd/MM/yyyy HH:mm'),
        m.source,
        m.keyword?.term || '',
        m.sentiment,
        m.reach || 0,
        m.engagement || 0,
        m.author || '',
        m.sourceUrl || '',
        `"${(m.content || '').replace(/"/g, "'").replace(/\n/g, ' ')}"`,
      ])
    ];
    const csv = rows.map(r => r.join(';')).join('\n');
    const bom = '\uFEFF'; // UTF-8 BOM for Excel
    download(bom + csv, `reporte_${reportData.meta.campaign}_${period}.csv`, 'text/csv;charset=utf-8');
    toast.success(`CSV descargado — ${reportData.allMentions.length} menciones`);
  }

  // ─── Download as TXT (executive summary) ────────────────────────────────
  function downloadTXT() {
    if (!reportData) return;
    const d = reportData;
    const sep = '═'.repeat(60);
    const sep2 = '─'.repeat(60);

    const txt = [
      sep,
      `  REPORTE DE MONITOREO POLÍTICO`,
      `  Campaña: ${d.meta.campaign}`,
      `  Período: ${d.meta.period} | Generado: ${safeFormat(d.meta.generatedAt, "dd/MM/yyyy HH:mm")}`,
      `  Analista: ${d.meta.analyst || 'Sistema'}`,
      sep,
      '',
      '📊 RESUMEN EJECUTIVO',
      sep2,
      `  Total menciones:      ${d.summary.total.toLocaleString()}`,
      `  Variación vs período: ${d.summary.delta >= 0 ? '+' : ''}${d.summary.delta}%`,
      `  Alcance total:        ${fmtNum(d.summary.totalReach)} personas`,
      `  Engagement total:     ${fmtNum(d.summary.totalEngagement)}`,
      '',
      '😊 ANÁLISIS DE SENTIMIENTO',
      sep2,
      `  Positivo:  ${d.sentiment.positive.count} menciones (${d.sentiment.positive.pct}%) — alcance: ${fmtNum(d.sentiment.positive.reach)}`,
      `  Negativo:  ${d.sentiment.negative.count} menciones (${d.sentiment.negative.pct}%) — alcance: ${fmtNum(d.sentiment.negative.reach)}`,
      `  Neutral:   ${d.sentiment.neutral.count} menciones (${d.sentiment.neutral.pct}%) — alcance: ${fmtNum(d.sentiment.neutral.reach)}`,
      d.sentiment.negative.pct > 40 ? '\n  ⚠️  ATENCIÓN: Sentimiento negativo supera el 40%. Se recomienda acción comunicacional inmediata.' : '',
      '',
      '🌐 MENCIONES POR FUENTE',
      sep2,
      ...d.bySource.map(s => `  ${(SRC_ICONS[s.source]||'•')} ${s.source.padEnd(12)} ${String(s.count).padStart(5)} menciones  (${s.pct}%)  alcance: ${fmtNum(s.reach)}`),
      '',
      '🔑 KEYWORDS MÁS MENCIONADAS',
      sep2,
      ...d.keywords.map((k,i) => `  ${String(i+1).padStart(2)}. ${k.term.padEnd(30)} ${String(k.mentions).padStart(5)} menciones  (${k.pct}%)`),
      '',
      '🔥 TOP 10 MENCIONES POR ALCANCE',
      sep2,
      ...d.topMentions.slice(0,10).map((m,i) => [
        `  ${i+1}. [${m.source}] ${safeFormat(m.publishedAt, 'dd/MM HH:mm')} — Alcance: ${fmtNum(m.reach)}`,
        `     Sentimiento: ${m.sentiment}${m.keyword ? ` | Keyword: ${m.keyword.term}` : ''}`,
        `     ${m.content.slice(0,200).replace(/\n/g,' ')}...`,
        m.sourceUrl ? `     URL: ${m.sourceUrl}` : '',
        '',
      ].filter(Boolean).join('\n')),
      '',
      '⚠️  TOP 10 MENCIONES NEGATIVAS',
      sep2,
      ...d.negativeMentions.slice(0,10).map((m,i) => [
        `  ${i+1}. [${m.source}] ${safeFormat(m.publishedAt, 'dd/MM HH:mm')}${m.author ? ` — @${m.author}` : ''}`,
        `     ${m.content.slice(0,200).replace(/\n/g,' ')}...`,
        m.sourceUrl ? `     URL: ${m.sourceUrl}` : '',
        '',
      ].filter(Boolean).join('\n')),
      '',
      '📝 PALABRAS MÁS FRECUENTES EN MENCIONES NEGATIVAS',
      sep2,
      '  ' + d.topNegWords.slice(0,10).map(w => `"${w.word}" (${w.count})`).join('  |  '),
      '',
      `📋 TODAS LAS MENCIONES DEL PERÍODO (${d.allMentions.length})`,
      sep2,
      ...d.allMentions.map((m,i) => {
        const comments = m.commentsList || [];
        return [
          `  ${i+1}. [${m.source}] ${safeFormat(m.publishedAt, 'dd/MM/yyyy HH:mm')}${m.keyword ? ` | Keyword: ${m.keyword.term}` : ''}`,
          `     Página/Autor: ${m.sourceName || m.author || '—'} | Sentimiento: ${m.sentiment} | Alcance: ${fmtNum(m.reach)} | Engagement: ${fmtNum(m.engagement)}`,
          `     ${(m.content || '').replace(/\n/g,' ')}`,
          m.sourceUrl ? `     URL: ${m.sourceUrl}` : '',
          comments.length > 0 ? `     Comentarios (${comments.length}): ${comments.map(c => `[${c.sentiment||'?'}] ${(c.text||'').replace(/\n/g,' ')}`).join(' | ')}` : '',
          '',
        ].filter(Boolean).join('\n');
      }),
      '',
      sep,
      `  Fin del reporte — PoliticaMonitor © ${new Date().getFullYear()}`,
      sep,
    ].join('\n');

    download(txt, `reporte_ejecutivo_${d.meta.campaign}_${period}.txt`, 'text/plain;charset=utf-8');
    toast.success('Reporte ejecutivo descargado');
  }

  // ─── Download as JSON (full data) ───────────────────────────────────────
  function downloadJSON() {
    if (!reportData) return;
    const json = JSON.stringify(reportData, null, 2);
    download(json, `reporte_completo_${reportData.meta.campaign}_${period}.json`, 'application/json');
    toast.success('JSON completo descargado');
  }

  // ─── Download negative mentions CSV ─────────────────────────────────────
  function downloadNegativeCSV() {
    if (!reportData) return;
    const rows = [
      ['Fecha','Fuente','Keyword','Alcance','Autor','URL','Contenido'],
      ...reportData.negativeMentions.map(m => [
        safeFormat(m.publishedAt, 'dd/MM/yyyy HH:mm'),
        m.source, m.keyword?.term||'', m.reach||0,
        m.author||'', m.sourceUrl||'',
        `"${(m.content||'').replace(/"/g,"'").replace(/\n/g,' ')}"`,
      ])
    ];
    const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\n');
    download(csv, `menciones_negativas_${reportData.meta.campaign}_${period}.csv`, 'text/csv;charset=utf-8');
    toast.success('CSV de menciones negativas descargado');
  }

  // ─── Helper ──────────────────────────────────────────────────────────────
  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  if (authLoading) return null;

  const d = reportData;

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

      {/* HEADER */}
      <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', padding:'14px 24px', display:'flex', alignItems:'center', gap:'16px', position:'sticky', top:0, zIndex:40 }}>
        <button onClick={()=>router.push('/dashboard')} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:'20px' }}>←</button>
        <span style={{ fontSize:'20px' }}>📊</span>
        <span style={{ fontSize:'17px', fontWeight:'700' }}>Reportes y exportaciones</span>
        <select value={campaignId} onChange={e=>setCampaignId(e.target.value)} style={{ marginLeft:'auto', width:'auto', padding:'7px 12px', fontSize:'13px' }}>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ maxWidth:'1100px', margin:'0 auto', padding:'28px 24px', display:'flex', flexDirection:'column', gap:'20px' }}>

        {/* CONFIG CARD */}
        <div className="card">
          <div style={{ fontSize:'15px', fontWeight:'700', marginBottom:'16px' }}>⚙️ Configurar reporte</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr) auto', gap:'12px', alignItems:'end' }}>
            <div>
              <label>Período</label>
              <select value={period} onChange={e=>setPeriod(e.target.value)}>
                <option value="1h">Última hora</option>
                <option value="24h">Últimas 24 horas</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="90d">Últimos 90 días</option>
              </select>
            </div>
            <div>
              <label>Fuente</label>
              <select value={source} onChange={e=>setSource(e.target.value)}>
                <option value="ALL">Todas las fuentes</option>
                <option value="FACEBOOK">📘 Facebook</option>
                <option value="INSTAGRAM">📸 Instagram</option>
                <option value="TWITTER">🐦 Twitter/X</option>
                <option value="NEWS">📰 Noticias</option>
                <option value="WEB">🌐 Web</option>
              </select>
            </div>
            <div>
              <label>Sentimiento</label>
              <select value={sentiment} onChange={e=>setSentiment(e.target.value)}>
                <option value="ALL">Todos</option>
                <option value="POSITIVE">😊 Positivo</option>
                <option value="NEGATIVE">⚠️ Negativo</option>
                <option value="NEUTRAL">😐 Neutral</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ height:'38px', minWidth:'140px', justifyContent:'center' }}>
              {loading ? '⏳ Generando...' : '📊 Generar reporte'}
            </button>
          </div>
        </div>

        {/* DOWNLOAD BUTTONS — shown when report is ready */}
        {d && (
          <div className="card" style={{ background:'linear-gradient(135deg,#1e3a5f20,#8b5cf620)', borderColor:'var(--border2)' }}>
            <div style={{ fontSize:'15px', fontWeight:'700', marginBottom:'4px' }}>⬇️ Descargar reporte</div>
            <div style={{ fontSize:'13px', color:'var(--text3)', marginBottom:'16px' }}>
              {d.summary.total.toLocaleString()} menciones del período seleccionado
            </div>
            <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
              <button onClick={downloadCSV} style={{ background:'#10b98120', border:'1px solid #10b98140', color:'#34d399', borderRadius:'8px', padding:'10px 18px', cursor:'pointer', fontSize:'13px', fontWeight:'600', display:'flex', alignItems:'center', gap:'8px' }}>
                📄 CSV completo <span style={{ fontSize:'11px', opacity:0.7 }}>{d.allMentions.length} filas</span>
              </button>
              <button onClick={downloadNegativeCSV} style={{ background:'#ef444420', border:'1px solid #ef444440', color:'#f87171', borderRadius:'8px', padding:'10px 18px', cursor:'pointer', fontSize:'13px', fontWeight:'600', display:'flex', alignItems:'center', gap:'8px' }}>
                ⚠️ CSV menciones negativas <span style={{ fontSize:'11px', opacity:0.7 }}>{d.negativeMentions.length} filas</span>
              </button>
              <button onClick={downloadTXT} style={{ background:'#3b82f620', border:'1px solid #3b82f640', color:'#60a5fa', borderRadius:'8px', padding:'10px 18px', cursor:'pointer', fontSize:'13px', fontWeight:'600', display:'flex', alignItems:'center', gap:'8px' }}>
                📝 Informe ejecutivo TXT
              </button>
              <button onClick={downloadJSON} style={{ background:'#8b5cf620', border:'1px solid #8b5cf640', color:'#a78bfa', borderRadius:'8px', padding:'10px 18px', cursor:'pointer', fontSize:'13px', fontWeight:'600', display:'flex', alignItems:'center', gap:'8px' }}>
                🔧 JSON completo (API)
              </button>
            </div>
            <div style={{ marginTop:'12px', fontSize:'12px', color:'var(--text3)' }}>
              💡 El CSV se abre directamente en Excel. El TXT es ideal para enviar al equipo. El JSON es para integrar con otras herramientas.
            </div>
          </div>
        )}

        {/* REPORT PREVIEW */}
        {d && (
          <>
            {/* STATS ROW */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'14px' }}>
              {[
                { label:'Total menciones', value:d.summary.total.toLocaleString(), sub:`${d.summary.delta>=0?'↑':'↓'} ${Math.abs(d.summary.delta)}% vs período anterior`, color:'#60a5fa' },
                { label:'Alcance total', value:fmtNum(d.summary.totalReach), sub:'personas alcanzadas', color:'#8b5cf6' },
                { label:'Sentimiento positivo', value:d.sentiment.positive.pct+'%', sub:`${d.sentiment.positive.count} menciones`, color:'#10b981' },
                { label:'Sentimiento negativo', value:d.sentiment.negative.pct+'%', sub:d.sentiment.negative.pct>40?'⚠️ Requiere atención':'Bajo control', color:'#ef4444' },
              ].map((s,i)=>(
                <div key={i} className="card" style={{ padding:'16px' }}>
                  <div style={{ fontSize:'11px', color:'var(--text3)', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>{s.label}</div>
                  <div style={{ fontSize:'26px', fontWeight:'700', color:s.color, lineHeight:1, marginBottom:'4px' }}>{s.value}</div>
                  <div style={{ fontSize:'11px', color:'var(--text3)' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* CHARTS */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

              {/* Sentiment pie */}
              <div className="card">
                <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>Distribución de sentimiento</div>
                <div style={{ height:'180px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name:'Positivo', value:d.sentiment.positive.count, color:'#10b981' },
                          { name:'Negativo', value:d.sentiment.negative.count, color:'#ef4444' },
                          { name:'Neutral',  value:d.sentiment.neutral.count,  color:'#64748b' },
                        ]}
                        cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                        dataKey="value" paddingAngle={2}
                        label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}
                      >
                        {[{color:'#10b981'},{color:'#ef4444'},{color:'#64748b'}].map((e,i)=><Cell key={i} fill={e.color}/>)}
                      </Pie>
                      <Tooltip contentStyle={{ background:'#1a2235', border:'1px solid #2d4a7a', borderRadius:'8px' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* By source bar */}
              <div className="card">
                <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>Menciones por fuente</div>
                <div style={{ height:'180px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.bySource} margin={{ top:0, right:10, left:-10, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e3058"/>
                      <XAxis dataKey="source" tick={{ fill:'#64748b', fontSize:11 }}/>
                      <YAxis tick={{ fill:'#64748b', fontSize:11 }}/>
                      <Tooltip contentStyle={{ background:'#1a2235', border:'1px solid #2d4a7a', borderRadius:'8px' }}/>
                      <Bar dataKey="count" name="Menciones" radius={[4,4,0,0]}>
                        {d.bySource.map((e,i)=><Cell key={i} fill={SRC_COLORS[e.source]||'#3b82f6'}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Hourly volume */}
            {d.hourlyVolume?.length > 0 && (
              <div className="card">
                <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>Volumen horario — positivo vs negativo vs neutral</div>
                <div style={{ height:'200px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.hourlyVolume} margin={{ top:5, right:10, left:-10, bottom:5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e3058"/>
                      <XAxis dataKey="hour" tick={{ fill:'#64748b', fontSize:10 }} tickFormatter={v=>v?safeFormat(v,'HH:mm'):''}/>
                      <YAxis tick={{ fill:'#64748b', fontSize:10 }}/>
                      <Tooltip contentStyle={{ background:'#1a2235', border:'1px solid #2d4a7a', borderRadius:'8px', color:'#f1f5f9' }} labelFormatter={v=>v?safeFormat(v,'dd/MM HH:mm'):''}/>
                      <Legend wrapperStyle={{ fontSize:'12px', color:'#94a3b8' }}/>
                      <Line type="monotone" dataKey="total"    stroke="#3b82f6" strokeWidth={2} dot={false} name="Total"/>
                      <Line type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={2} dot={false} name="Positivo"/>
                      <Line type="monotone" dataKey="negative" stroke="#ef4444" strokeWidth={2} dot={false} name="Negativo"/>
                      <Line type="monotone" dataKey="neutral"  stroke="#64748b" strokeWidth={1.5} dot={false} name="Neutral" strokeDasharray="4 2"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Calendario de menciones */}
            <MentionsHeatmap mentions={d.allMentions} />

            {/* Keywords table */}
            <div className="card">
              <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>🔑 Rendimiento por keyword</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {d.keywords.map((kw,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', background:'var(--bg3)', borderRadius:'8px' }}>
                    <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:kw.color||'#3b82f6', flexShrink:0 }}/>
                    <span style={{ flex:1, fontWeight:'600', fontSize:'13px' }}>{kw.term}</span>
                    <div style={{ width:'180px', height:'6px', background:'var(--bg4)', borderRadius:'3px', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${kw.pct}%`, background:'#3b82f6', borderRadius:'3px' }}/>
                    </div>
                    <span style={{ minWidth:'80px', textAlign:'right', fontSize:'13px', color:'var(--text2)' }}>{kw.mentions.toLocaleString()} menciones</span>
                    <span style={{ minWidth:'40px', textAlign:'right', fontSize:'12px', color:'var(--text3)' }}>{kw.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Source breakdown table */}
            <div className="card">
              <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>📊 Detalle por fuente</div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Fuente','Menciones','% del total','Alcance','Engagement'].map(h=>(
                      <th key={h} style={{ textAlign:'left', padding:'8px 12px', color:'var(--text3)', fontWeight:'600', fontSize:'11px', textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.bySource.map((s,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: i%2===0?'transparent':'var(--bg3)' }}>
                      <td style={{ padding:'10px 12px', fontWeight:'600' }}>{SRC_ICONS[s.source]||'•'} {s.source}</td>
                      <td style={{ padding:'10px 12px', color:'var(--accent2)' }}>{s.count.toLocaleString()}</td>
                      <td style={{ padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <div style={{ width:'60px', height:'5px', background:'var(--bg4)', borderRadius:'3px', overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${s.pct}%`, background:SRC_COLORS[s.source]||'#3b82f6' }}/>
                          </div>
                          {s.pct}%
                        </div>
                      </td>
                      <td style={{ padding:'10px 12px', color:'var(--text2)' }}>{fmtNum(s.reach)}</td>
                      <td style={{ padding:'10px 12px', color:'var(--text2)' }}>{fmtNum(s.engagement)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top negative words */}
            {d.topNegWords?.length > 0 && (
              <div className="card">
                <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>⚠️ Palabras más frecuentes en menciones negativas</div>
                <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                  {d.topNegWords.map((w,i)=>(
                    <span key={i} style={{ background:'#ef444415', border:'1px solid #ef444440', color:'#f87171', padding:'5px 12px', borderRadius:'20px', fontSize:'13px', fontWeight:'600' }}>
                      {w.word} <span style={{ opacity:0.6, fontSize:'11px' }}>×{w.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Top mentions */}
            <div className="card">
              <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>🔥 Top 10 menciones por alcance</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                {d.topMentions.slice(0,10).map((m,i)=>(
                  <MiniMentionCard key={m.id} mention={m} rank={i+1}/>
                ))}
              </div>
            </div>

            {/* Negative mentions */}
            {d.negativeMentions.length > 0 && (
              <div className="card">
                <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px', color:'#f87171' }}>⚠️ Menciones negativas recientes</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {d.negativeMentions.slice(0,10).map((m,i)=>(
                    <MiniMentionCard key={m.id} mention={m} rank={i+1} negative/>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* PAST REPORTS */}
        {pastReports.length > 0 && (
          <div className="card">
            <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>🕒 Reportes anteriores</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {pastReports.map(r=>(
                <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', background:'var(--bg3)', borderRadius:'8px', fontSize:'13px' }}>
                  <span>📊</span>
                  <span style={{ flex:1, color:'var(--text2)' }}>Reporte {r.period} — {r.type}</span>
                  <span style={{ color:'var(--text3)', fontSize:'12px' }}>{safeFormat(r.createdAt, "dd/MM/yyyy HH:mm")}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Mini Mention Card ────────────────────────────────────────────────────────
function MiniMentionCard({ mention: m, rank, negative }) {
  const SRC_COLORS2 = { WEB:'#0ea5e9', TWITTER:'#1d9bf0', FACEBOOK:'#1877f2', INSTAGRAM:'#e1306c', NEWS:'#f59e0b' };
  const SRC_ICONS2  = { WEB:'🌐', TWITTER:'🐦', FACEBOOK:'📘', INSTAGRAM:'📸', NEWS:'📰' };
  return (
    <div style={{ background: negative ? '#ef444408' : 'var(--bg3)', border:`1px solid ${negative?'#ef444430':'var(--border)'}`, borderRadius:'8px', padding:'12px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px', flexWrap:'wrap' }}>
        <span style={{ fontWeight:'700', color:'var(--text3)', fontSize:'12px' }}>#{rank}</span>
        <span style={{ background:`${SRC_COLORS2[m.source]||'#3b82f6'}20`, color:SRC_COLORS2[m.source]||'#60a5fa', border:`1px solid ${SRC_COLORS2[m.source]||'#3b82f6'}40`, padding:'2px 8px', borderRadius:'10px', fontSize:'11px', fontWeight:'700' }}>
          {SRC_ICONS2[m.source]||'🌐'} {m.source}
        </span>
        {m.keyword && <span style={{ background:'var(--bg4)', border:'1px solid var(--border2)', color:'var(--accent2)', fontSize:'11px', padding:'2px 7px', borderRadius:'10px' }}>#{m.keyword.term}</span>}
        <span style={{ marginLeft:'auto', fontSize:'11px', color:'var(--text3)' }}>{safeFormat(m.publishedAt, 'dd/MM HH:mm')}</span>
        {m.reach > 0 && <span style={{ fontSize:'11px', color:'var(--text3)' }}>👁️ {(m.reach/1000).toFixed(0)}k</span>}
      </div>
      <div style={{ fontSize:'13px', color:'var(--text)', lineHeight:'1.5' }}>
        {m.content.slice(0,220)}{m.content.length>220?'...':''}
      </div>
      {m.sourceUrl && (
        <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'11px', color:'var(--accent2)', marginTop:'4px', display:'inline-block' }}>🔗 Ver fuente</a>
      )}
    </div>
  );
}
