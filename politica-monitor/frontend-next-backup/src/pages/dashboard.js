// src/pages/dashboard.js — PoliticaMonitor Dashboard v3
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import api, { apiDirect } from '../lib/api';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { downloadMentionsXLSX, downloadMentionsTXT } from '../lib/exportMentions';

// ─── Constantes ───────────────────────────────────────────────────────────────
const ARGENTINA_GEO = {
  'Buenos Aires':['La Plata','Mar del Plata','Bahía Blanca','Quilmes','Lanús','Lomas de Zamora'],
  'Córdoba':['Córdoba Capital','Villa Carlos Paz','Río Cuarto','San Francisco','Villa María'],
  'Santa Fe':['Rosario','Santa Fe Capital','Rafaela','Venado Tuerto','Villa Gobernador Gálvez'],
  'Mendoza':['Mendoza Capital','Godoy Cruz','San Rafael','Maipú','Luján de Cuyo'],
  'Tucumán':['San Miguel de Tucumán','Yerba Buena','Tafí Viejo','Banda del Río Salí'],
  'Entre Ríos':['Paraná','Concordia','Gualeguaychú','Concepción del Uruguay'],
  'Salta':['Salta Capital','Orán','Tartagal','San Ramón de la Nueva Orán'],
  'Misiones':['Posadas','Oberá','Eldorado','Puerto Iguazú'],
  'Chaco':['Resistencia','Presidencia Roque Sáenz Peña','Villa Ángela'],
  'Corrientes':['Corrientes Capital','Goya','Paso de los Libres'],
  'Santiago del Estero':['Santiago del Estero Capital','La Banda','Termas de Río Hondo'],
  'San Juan':['San Juan Capital','Rivadavia','Chimbas','Rawson'],
  'Jujuy':['San Salvador de Jujuy','Palpalá','San Pedro de Jujuy'],
  'Río Negro':['Viedma','Bariloche','General Roca','Cipolletti'],
  'Neuquén':['Neuquén Capital','Cutral Co','Plaza Huincul','Zapala'],
  'Formosa':['Formosa Capital','Clorinda','Pirané'],
  'La Pampa':['Santa Rosa','General Pico','Toay'],
  'Chubut':['Rawson','Comodoro Rivadavia','Trelew','Puerto Madryn'],
  'San Luis':['San Luis Capital','Villa Mercedes','Merlo'],
  'Catamarca':['San Fernando del Valle de Catamarca','Andalgalá'],
  'La Rioja':['La Rioja Capital','Chilecito'],
  'Santa Cruz':['Río Gallegos','Caleta Olivia','El Calafate','Pico Truncado'],
  'Tierra del Fuego':['Río Grande','Ushuaia','Tolhuin'],
};

const SOURCE_META = {
  WEB:      { icon:'🌐', color:'#0ea5e9', label:'Web' },
  NEWS:     { icon:'📰', color:'#f59e0b', label:'Noticias' },
  FACEBOOK: { icon:'📘', color:'#1877f2', label:'Facebook' },
  INSTAGRAM:{ icon:'📸', color:'#e1306c', label:'Instagram' },
  TWITTER:  { icon:'🐦', color:'#1da1f2', label:'Twitter/X' },
};

const SENT_META = {
  POSITIVE:{ color:'#10b981', label:'Positivo', icon:'😊' },
  NEGATIVE:{ color:'#ef4444', label:'Negativo', icon:'⚠️' },
  NEUTRAL: { color:'#64748b', label:'Neutral',  icon:'😐' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(date) {
  try { return formatDistanceToNow(new Date(date), { addSuffix:true, locale:es }); } catch { return ''; }
}

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
  if (n >= 1000) return (n/1000).toFixed(1)+'K';
  return n.toString();
}

// ─── API helpers ──────────────────────────────────────────────────────────────
const campaignsAPI = {
  list:   ()  => api.get('/campaigns').then(r=>r.data.campaigns),
  create: (d) => api.post('/campaigns', d).then(r=>r.data.campaign),
  update: (id,d) => api.put(`/campaigns/${id}`, d).then(r=>r.data.campaign),
  delete: (id) => api.delete(`/campaigns/${id}`),
};
const keywordsAPI = {
  list:   (cid) => api.get(`/keywords?campaignId=${cid}`).then(r=>r.data.keywords),
  create: (d)   => api.post('/keywords', d).then(r=>r.data.keyword),
  update: (id, d) => api.put(`/keywords/${id}`, d).then(r=>r.data.keyword),
  delete: (id)  => api.delete(`/keywords/${id}`),
};
const mentionsAPI = {
  list:   (p)  => api.get('/mentions', {params:p}).then(r=>r.data),
  delete: (id) => api.delete(`/mentions/${id}`),
  unread: (cid)=> api.get('/mentions/unread-count', {params:{campaignId:cid}}).then(r=>r.data.count),
};
const analyticsAPI = {
  summary:    (p) => api.get('/analytics/summary', {params:p}).then(r=>r.data),
  timeseries: (p) => api.get('/analytics/timeseries', {params:p}).then(r=>r.data),
};

// ─── COMPONENTES UI ───────────────────────────────────────────────────────────
function Badge({ source }) {
  const m = SOURCE_META[source] || { icon:'🔗', color:'#64748b', label:source };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', background:`${m.color}18`,
      color:m.color, border:`1px solid ${m.color}35`, borderRadius:'6px',
      padding:'2px 8px', fontSize:'11px', fontWeight:'700', letterSpacing:'0.3px' }}>
      {m.icon} {m.label}
    </span>
  );
}

function SentBadge({ sentiment }) {
  const m = SENT_META[sentiment] || SENT_META.NEUTRAL;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', background:`${m.color}15`,
      color:m.color, borderRadius:'6px', padding:'2px 8px', fontSize:'11px', fontWeight:'600' }}>
      {m.icon} {m.label}
    </span>
  );
}

function KpiCard({ label, value, sub, trend, color='var(--accent)' }) {
  const trendUp = trend > 0;
  return (
    <div className="kpi-card" style={{ '--kpi-color': color }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">
        {trend !== undefined && (
          <span className={trendUp ? 'kpi-trend-up' : 'kpi-trend-down'}>
            {trendUp?'↑':'↓'} {Math.abs(trend)}%
          </span>
        )}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

// ─── MENTION DETAIL MODAL ─────────────────────────────────────────────────────
function MentionDetailModal({ mention, onClose }) {
  if (!mention) return null;

  const comments = mention.commentsList || [];
  const isIgEmbed = mention.source === 'INSTAGRAM' && mention.sourceUrl && (mention.sourceUrl.includes('/p/') || mention.sourceUrl.includes('/reel/'));
  // El embed público de Facebook (plugins/post.php) solo anda bien con
  // permalinks de "posts" — reels/videos no rinden igual, mejor no mostrarlos.
  const isFbEmbed = mention.source === 'FACEBOOK' && mention.sourceUrl && mention.sourceUrl.includes('/posts/');
  const hasEmbed = isIgEmbed || isFbEmbed;
  const embedSrc = isIgEmbed
    ? mention.sourceUrl + 'embed/'
    : `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(mention.sourceUrl)}&show_text=false&width=280`;

  // Analyze comment sentiments locally
  const posWords = ['bueno','bien','excelente','grande','genio','crack','bien','bravo','apoyo','gracias','felicidades','hermoso','increible','groso','idolo','capo','fenomeno','aplauso','vamos'];
  const negWords = ['malo','corrupto','ladron','robo','fraude','mentira','verguenza','asco','desastre','basura','rata','chorro','delincuente','impresentable','nefasto','hdp','inutil','payaso','careta','trucho'];

  function analyzeSent(text) {
    const t = (text||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let p = 0, n = 0;
    posWords.forEach(w => { if (t.includes(w)) p++; });
    negWords.forEach(w => { if (t.includes(w)) n++; });
    if (p > n) return 'POSITIVE';
    if (n > p) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  // El backend ya analiza el sentimiento de cada comentario (NVIDIA + fallback
  // por palabras clave) al guardarlo; esto es solo respaldo para comentarios
  // viejos guardados antes de que existiera ese campo.
  const analyzed = comments.map(c => ({ ...c, sentiment: c.sentiment || analyzeSent(c.text) }));
  const sentCounts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
  analyzed.forEach(c => sentCounts[c.sentiment]++);
  const total = analyzed.length || 1;

  // Top 3 palabras más usadas en comentarios
  const stopwords = new Set(['que','de','la','el','en','y','a','los','las','un','una','es','se','del','por','con','para','como','lo','su','al','no','pero','mas','este','esta','son','hay','fue','era','me','mi','te','tu','le','nos','si','ya','muy','todo','todos','bien','ser','estar','hacer','ver','sin','sobre','cada','esto','eso','porque','cuando','donde','tiene','tiene','puede','hace','mas','van','van','les','sus','fue','eso','han','ahora','solo','como','uno','otra','otro','estos','estas','tan']);
  const wordCounts = {};
  comments.forEach(c => {
    (c.text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach(w => {
      if (w.length > 3 && !stopwords.has(w)) wordCounts[w] = (wordCounts[w] || 0) + 1;
    });
  });
  const topWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const pieData = [
    { name: 'Positivo', value: sentCounts.POSITIVE, color: '#10b981' },
    { name: 'Negativo', value: sentCounts.NEGATIVE, color: '#f43f5e' },
    { name: 'Neutral', value: sentCounts.NEUTRAL, color: '#475569' },
  ].filter(d => d.value > 0);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth:'700px', width:'95vw' }}>
        <div className="modal-title">
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <Badge source={mention.source} />
            <span>Detalle de mención</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:'22px', lineHeight:1 }}>×</button>
        </div>

        {/* Post embed + info */}
        <div style={{ display:'flex', gap:'16px', marginBottom:'20px', flexWrap:'wrap' }}>
          {hasEmbed && (
            <div style={{ width:'280px', flexShrink:0, borderRadius:'12px', overflow:'hidden', border:'1px solid var(--border)' }}>
              <iframe src={embedSrc} frameBorder="0" scrolling="no" loading="lazy"
                style={{ width:'280px', height: isFbEmbed ? '500px' : '350px', border:'none' }} />
            </div>
          )}
          <div style={{ flex:1, minWidth:'200px' }}>
            <div style={{ fontSize:'13px', color:'var(--text3)', marginBottom:'4px' }}>{mention.author || mention.sourceName}</div>
            <p style={{ fontSize:'13px', color:'var(--text2)', lineHeight:'1.6', marginBottom:'12px' }}>
              {(mention.content || '').slice(0, 400)}
            </p>
            <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
              <SentBadge sentiment={mention.sentiment} />
              {mention.reach > 0 && <span style={{ fontSize:'12px', color:'var(--text3)' }}>❤️ {fmtNum(mention.reach)}</span>}
              {mention.engagement > 0 && <span style={{ fontSize:'12px', color:'var(--text3)' }}>💬 {fmtNum(mention.engagement - (mention.reach || 0))}</span>}
            </div>
          </div>
        </div>

        {/* Comments section */}
        {analyzed.length > 0 ? (
          <>
            <div style={{ display:'flex', gap:'16px', marginBottom:'16px', flexWrap:'wrap' }}>
              {/* Pie chart */}
              <div style={{ width:'160px', flexShrink:0 }}>
                <div style={{ fontSize:'12px', fontWeight:'700', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'8px' }}>Sentimiento</div>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={v => [v, 'comentarios']} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ fontSize:'11px', color:'var(--text3)', textAlign:'center', marginTop:'4px' }}>
                  {analyzed.length} comentarios analizados
                </div>
              </div>

              {/* Percentages */}
              <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', gap:'8px' }}>
                {[
                  { label: 'Positivo', count: sentCounts.POSITIVE, color: '#10b981', icon: '😊' },
                  { label: 'Negativo', count: sentCounts.NEGATIVE, color: '#f43f5e', icon: '⚠️' },
                  { label: 'Neutral', count: sentCounts.NEUTRAL, color: '#475569', icon: '😐' },
                ].map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <span>{s.icon}</span>
                    <div style={{ flex:1, height:'6px', borderRadius:'3px', background:'var(--bg3)', overflow:'hidden' }}>
                      <div style={{ width:`${Math.round((s.count / total) * 100)}%`, height:'100%', background:s.color, borderRadius:'3px', transition:'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize:'12px', fontWeight:'700', color:s.color, minWidth:'35px', textAlign:'right' }}>{Math.round((s.count / total) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top words */}
            {topWords.length > 0 && (
              <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
                <span style={{ fontSize:'11px', color:'var(--text3)', fontWeight:'600', alignSelf:'center' }}>Palabras clave:</span>
                {topWords.map(([word, count]) => (
                  <span key={word} style={{ padding:'4px 12px', borderRadius:'100px', background:'var(--accent-dim)', border:'1px solid rgba(14,165,233,0.2)', color:'var(--accent2)', fontSize:'12px', fontWeight:'700' }}>
                    {word} <span style={{ color:'var(--text3)', fontWeight:'400' }}>({count})</span>
                  </span>
                ))}
              </div>
            )}

            {/* Comment list */}
            <div style={{ fontSize:'12px', fontWeight:'700', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'8px' }}>Comentarios recientes</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px', maxHeight:'300px', overflowY:'auto' }}>
              {analyzed.map((c, i) => {
                const sColor = c.sentiment === 'POSITIVE' ? '#10b981' : c.sentiment === 'NEGATIVE' ? '#f43f5e' : '#475569';
                return (
                  <div key={i} style={{ padding:'10px 14px', background:'var(--bg3)', borderRadius:'10px', borderLeft:`3px solid ${sColor}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                      <span style={{ fontSize:'12px', fontWeight:'700', color:'var(--text)' }}>@{c.author || 'usuario'}</span>
                      <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'100px', background:`${sColor}20`, color:sColor, fontWeight:'600' }}>
                        {c.sentiment === 'POSITIVE' ? '😊 Positivo' : c.sentiment === 'NEGATIVE' ? '⚠️ Negativo' : '😐 Neutral'}
                      </span>
                    </div>
                    <p style={{ fontSize:'12px', color:'var(--text2)', lineHeight:'1.5', margin:0 }}>{c.text}</p>
                    {c.likes > 0 && <span style={{ fontSize:'10px', color:'var(--text3)', marginTop:'4px', display:'inline-block' }}>❤️ {c.likes}</span>}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ textAlign:'center', padding:'24px', background:'var(--bg3)', borderRadius:'10px', color:'var(--text3)', fontSize:'13px' }}>
            Sin comentarios disponibles para esta mención
          </div>
        )}

        {mention.sourceUrl && (
          <a href={mention.sourceUrl} target="_blank" rel="noreferrer"
            style={{ display:'block', textAlign:'center', marginTop:'16px', padding:'10px', background:'var(--accent-dim)', border:'1px solid rgba(14,165,233,0.2)', borderRadius:'10px', color:'var(--accent2)', fontSize:'13px', fontWeight:'600', textDecoration:'none' }}>
            Ver publicación original →
          </a>
        )}
      </div>
    </div>
  );
}

function MentionCard({ mention, onDelete, onClick }) {
  const content = mention.content || '';
  const isLong = false;

  // Separar título del cuerpo si el contenido tiene formato "[Título]. Descripción"
  const titleMatch = content.match(/^\[([^\]]+)\]\s*/);
  const displayTitle = titleMatch ? titleMatch[1] : null;
  const bodyText = titleMatch ? content.slice(titleMatch[0].length) : content;

  return (
    <div className="mention-card" onClick={() => onClick?.(mention)} style={{ cursor:'pointer' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', marginBottom:'8px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'7px', flexWrap:'wrap' }}>
          <Badge source={mention.source} />
          {mention.keyword && (
            <span style={{ background:'rgba(139,92,246,0.1)', color:'#a78bfa', border:'1px solid rgba(139,92,246,0.2)', borderRadius:'5px', padding:'1px 7px', fontSize:'11px', fontWeight:'600' }}>
              #{mention.keyword.term}
            </span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
          <span style={{ fontSize:'11px', color:'var(--text3)', whiteSpace:'nowrap' }}>{timeAgo(mention.publishedAt)}</span>
          <button onClick={()=>onDelete(mention.id)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:'16px', lineHeight:1, opacity:0.4, padding:0 }}
            onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=0.4}>×</button>
        </div>
      </div>

      {/* Preview: imagen si hay (no para NEWS, que ya tiene su propio thumbnail chico) */}
      {mention.imageUrl && mention.source !== 'NEWS' ? (
        <a href={mention.sourceUrl || '#'} target="_blank" rel="noreferrer" style={{ display:'block', marginBottom:'10px' }}>
          <img src={mention.imageUrl} alt="" loading="lazy"
            onError={e => { e.target.style.display = 'none'; }}
            style={{ width:'100%', maxHeight:'140px', objectFit:'cover', borderRadius:'10px', border:'1px solid var(--border)', cursor:'pointer' }}
          />
        </a>
      ) : null}

      {/* Layout por tipo de source */}
      {mention.source === 'NEWS' && mention.sourceUrl ? (
        <div style={{ display:'flex', gap:'14px', alignItems:'flex-start' }}>
          <div style={{ flex:1, minWidth:0 }}>
            {displayTitle && (
              <a href={mention.sourceUrl} target="_blank" rel="noreferrer"
                style={{ display:'block', fontSize:'15px', fontWeight:'700', color:'var(--text)', textDecoration:'none', lineHeight:'1.4', marginBottom:'6px' }}
                onMouseEnter={e=>e.target.style.color='var(--accent2)'} onMouseLeave={e=>e.target.style.color='var(--text)'}>
                {displayTitle}
              </a>
            )}
            {bodyText && (
              <p style={{ fontSize:'13px', color:'var(--text2)', lineHeight:'1.6', margin:'0 0 10px' }}>
                {bodyText.slice(0, 300)}
              </p>
            )}
          </div>
          <a href={mention.sourceUrl} target="_blank" rel="noreferrer"
            style={{ flexShrink:0, width:'140px', height:'100px', borderRadius:'10px', overflow:'hidden', border:'1px solid var(--border)', background:'var(--bg3)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textDecoration:'none', gap:'6px' }}>
            <div style={{ width:'36px', height:'36px', borderRadius:'8px', background:'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(14,165,233,0.2))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px' }}>📰</div>
            <span style={{ fontSize:'10px', fontWeight:'700', color:'var(--accent2)', textAlign:'center', padding:'0 6px', lineHeight:'1.2', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'130px' }}>
              {mention.sourceName || 'Noticias'}
            </span>
          </a>
        </div>
      ) : mention.source === 'INSTAGRAM' && mention.sourceUrl && (mention.sourceUrl.includes('/p/') || mention.sourceUrl.includes('/reel/')) ? (
        <div style={{ display:'flex', gap:'14px', alignItems:'flex-start' }}>
          <div style={{ flex:1, minWidth:0 }}>
            {bodyText && (
              <p style={{ fontSize:'13px', color:'var(--text2)', lineHeight:'1.6', margin:'0 0 10px' }}>
                {isLong && !expanded ? bodyText.slice(0, 200) + '...' : bodyText}
                {isLong && (
                  <button onClick={()=>setExpanded(!expanded)} style={{ background:'none', border:'none', color:'var(--accent2)', cursor:'pointer', fontSize:'12px', fontWeight:'600', marginLeft:'6px' }}>
                    {expanded ? 'Ver menos' : 'Ver más'}
                  </button>
                )}
              </p>
            )}
          </div>
          <a href={mention.sourceUrl} target="_blank" rel="noreferrer" style={{ flexShrink:0, borderRadius:'10px', overflow:'hidden', border:'1px solid var(--border)', display:'block', width:'160px', height:'200px' }}>
            <iframe
              src={mention.sourceUrl + 'embed/'}
              frameBorder="0"
              scrolling="no"
              loading="lazy"
              style={{ width:'320px', height:'400px', border:'none', transform:'scale(0.5)', transformOrigin:'top left', pointerEvents:'none' }}
            />
          </a>
        </div>
      ) : (
        <>
          {/* Título como link (si hay URL) */}
          {displayTitle && mention.sourceUrl ? (
            <a href={mention.sourceUrl} target="_blank" rel="noreferrer"
              style={{ display:'block', fontSize:'14px', fontWeight:'700', color:'var(--text)', textDecoration:'none', lineHeight:'1.4', marginBottom:'6px' }}
              onMouseEnter={e=>e.target.style.color='#60a5fa'} onMouseLeave={e=>e.target.style.color='var(--text)'}>
              {displayTitle}
            </a>
          ) : displayTitle ? (
            <p style={{ fontSize:'14px', fontWeight:'700', color:'var(--text)', marginBottom:'6px', lineHeight:'1.4' }}>{displayTitle}</p>
          ) : null}

          {/* Cuerpo */}
          {bodyText && (
            <p style={{ fontSize:'13px', color:'var(--text2)', lineHeight:'1.6', margin:'0 0 10px' }}>
              {isLong && !expanded ? bodyText.slice(0, 280) + '...' : bodyText}
              {isLong && (
                <button onClick={()=>setExpanded(!expanded)} style={{ background:'none', border:'none', color:'var(--accent2)', cursor:'pointer', fontSize:'12px', fontWeight:'600', marginLeft:'6px' }}>
                  {expanded ? 'Ver menos' : 'Ver más'}
                </button>
              )}
            </p>
          )}
        </>
      )}

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
        <SentBadge sentiment={mention.sentiment} />
        {mention.reach > 0 && (
          <span style={{ fontSize:'11px', color:'var(--text3)' }}>👁️ {fmtNum(mention.reach)} alcance</span>
        )}
        <span style={{ fontSize:'11px', color:'var(--text3)', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {mention.sourceName}
        </span>
        {mention.sourceUrl && (
          <a href={mention.sourceUrl} target="_blank" rel="noreferrer"
            style={{ fontSize:'12px', color:'#60a5fa', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'4px', fontWeight:'600', flexShrink:0,
              background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:'6px', padding:'3px 8px' }}>
            🔗 Ver nota
          </a>
        )}
      </div>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width='480px' }) {
  useEffect(() => {
    const h = e => e.key==='Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:200, display:'flex',
      alignItems:'center', justifyContent:'center', padding:'20px', backdropFilter:'blur(4px)' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:'16px',
        width, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', padding:'28px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <span style={{ fontSize:'16px', fontWeight:'700' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:'20px', lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── MENTIONS HEATMAP (calendario tipo GitHub) ────────────────────────────────
function dayKey(dateVal) {
  const d = new Date(dateVal);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = ['', 'Lun', '', 'Mié', '', 'Vie', ''];

function MentionsHeatmap({ mentions }) {
  const counts = {};
  (mentions || []).forEach(m => {
    const k = dayKey(m.publishedAt);
    counts[k] = (counts[k] || 0) + 1;
  });

  // Rango fijo: últimas ~18 semanas (independiente de cuántos datos haya),
  // para que se vea un calendario real y no una columnita.
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

  function fmtDay(key) {
    try { return format(new Date(`${key}T12:00:00`), 'dd/MM/yyyy', { locale: es }); } catch { return key; }
  }

  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
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
          Día con más menciones: <strong style={{ color:'var(--text2)' }}>{fmtDay(topDay[0])}</strong> ({topDay[1]} mención{topDay[1] !== 1 ? 'es' : ''})
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
                  <div key={di} title={`${fmtDay(day.key)}: ${day.count} mención${day.count !== 1 ? 'es' : ''}`}
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

// ─── SCRAPER TEST PANEL (solo dev/test — sacar en producción) ─────────────────
function ScraperTestPanel({ campaignId }) {
  const [count, setCount] = useState(1);
  const [platforms, setPlatforms] = useState({ facebook: true, instagram: true });
  const [keywordOptions, setKeywordOptions] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, keyword: '', platform: '' });
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const runIdRef = useRef(null);
  const pollRef = useRef(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  // Polling de respaldo — el socket solo funciona corriendo local; en
  // producción (Cloud Functions) no hay conexión persistente, así que esto
  // es lo único que realmente actualiza la barra de progreso ahí.
  function startPolling(id) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get('/scraper-test/status', { params: { runId: id } });
        const run = r.data.run;
        if (!run) return;
        if (run.status === 'done') {
          setProgress({ done: run.total || 0, total: run.total || 0, keyword: '', platform: '' });
          setRunning(false);
          stopPolling();
          loadHistory();
        } else if (run.status === 'error') {
          setError(run.error || 'Error desconocido');
          setRunning(false);
          stopPolling();
        } else {
          setProgress({ done: run.done || 0, total: run.total || 0, keyword: run.keyword || '', platform: run.platform || '', skipped: run.status === 'skipped' });
        }
      } catch {}
    }, 2500);
  }

  useEffect(() => stopPolling, []);

  function loadHistory() {
    if (!campaignId) return;
    api.get('/scraper-test/history', { params: { campaignId } }).then(r => setHistory(r.data.runs || [])).catch(() => {});
  }

  useEffect(() => {
    if (!campaignId) return;
    keywordsAPI.list(campaignId).then(kws => {
      setKeywordOptions(kws || []);
      setSelectedKeywords((kws || []).map(k => k.term));
    }).catch(() => {});
    loadHistory();
  }, [campaignId]);

  function toggleKeyword(term) {
    setSelectedKeywords(p => p.includes(term) ? p.filter(t => t !== term) : [...p, term]);
  }

  useSocket(campaignId, {
    onScraperTestProgress: (data) => {
      if (data.runId !== runIdRef.current) return;
      if (data.status === 'running' || data.status === 'skipped') {
        setProgress({ done: data.done, total: data.total, keyword: data.keyword, platform: data.platform, skipped: data.status === 'skipped' });
      } else if (data.status === 'done') {
        setProgress({ done: data.total, total: data.total, keyword: '', platform: '' });
        setResults(data.results);
        setRunning(false);
        loadHistory();
      } else if (data.status === 'error' && data.total === undefined) {
        setError(data.error || 'Error desconocido');
        setRunning(false);
      }
    },
  });

  async function run() {
    if (!campaignId) return;
    const selectedPlatforms = Object.entries(platforms).filter(([, v]) => v).map(([k]) => k);
    if (selectedPlatforms.length === 0 || selectedKeywords.length === 0) return;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    runIdRef.current = runId;
    setRunning(true);
    setResults(null);
    setError('');
    setProgress({ done: 0, total: 0, keyword: '', platform: '' });
    startPolling(runId);
    try {
      // apiDirect pega directo a la Cloud Function (bypass del rewrite de
      // Hosting, que corta ~60s con 502 aunque el server siga corriendo bien).
      const res = await apiDirect.post('/scraper-test/run', { campaignId, count, runId, platforms: selectedPlatforms, keywords: selectedKeywords });
      setResults(res.data.results);
      setRunning(false);
      stopPolling();
      loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al correr la prueba');
      setRunning(false);
      stopPolling();
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : (running ? 5 : 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'18px', background:'linear-gradient(135deg,#8b5cf615,#3b82f615)', border:'1px solid #8b5cf640', borderRadius:'16px', padding:'22px' }}>
      <div>
        <h2 style={{ fontSize:'17px', fontWeight:'700', marginBottom:'6px' }}>🧪 Realizar prueba (test)</h2>
        <p style={{ fontSize:'13px', color:'var(--text2)', lineHeight:'1.6', marginBottom:'8px' }}>
          Cristian agregué este módulo acá para que pruebes libremente y me vayas dando devoluciones.
        </p>
        <p style={{ fontSize:'12px', color:'var(--text3)' }}>
          Corre Facebook + Instagram (Apify) para las keywords que elijas, sin filtrar por antigüedad, y guarda igual que una corrida normal (aparece en el Feed). Consume Apify real — usar con criterio.
        </p>
      </div>

      <div style={{ display:'flex', alignItems:'flex-start', gap:'24px', flexWrap:'wrap' }}>
        <div>
          <label>Redes sociales</label>
          <div style={{ display:'flex', gap:'14px', height:'38px', alignItems:'center' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', cursor:'pointer' }}>
              <input type="checkbox" checked={platforms.facebook} disabled={running}
                onChange={e => setPlatforms(p => ({ ...p, facebook: e.target.checked }))} />
              📘 Facebook
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', cursor:'pointer' }}>
              <input type="checkbox" checked={platforms.instagram} disabled={running}
                onChange={e => setPlatforms(p => ({ ...p, instagram: e.target.checked }))} />
              📸 Instagram
            </label>
          </div>
        </div>

        <div>
          <label>Keywords a probar</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', maxWidth:'420px' }}>
            {keywordOptions.length === 0 && <span style={{ fontSize:'12px', color:'var(--text3)' }}>Sin keywords en esta campaña</span>}
            {keywordOptions.map(k => (
              <label key={k.id} style={{
                display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', cursor:'pointer',
                padding:'5px 10px', borderRadius:'20px', border:`1px solid ${selectedKeywords.includes(k.term) ? '#8b5cf6' : 'var(--border)'}`,
                background: selectedKeywords.includes(k.term) ? '#8b5cf620' : 'var(--bg3)',
              }}>
                <input type="checkbox" checked={selectedKeywords.includes(k.term)} disabled={running}
                  onChange={() => toggleKeyword(k.term)} style={{ display:'none' }} />
                {k.term}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label>Posts por keyword/red</label>
          <input type="number" min="1" max="10" value={count} onChange={e => setCount(e.target.value)} style={{ width:'100px' }} disabled={running} />
        </div>
        <button className="btn btn-primary" onClick={run} disabled={running || !campaignId || (!platforms.facebook && !platforms.instagram) || selectedKeywords.length === 0} style={{ height:'38px' }}>
          {running ? '⏳ Corriendo...' : '🧪 Realizar prueba'}
        </button>
      </div>

      {running && (
        <div>
          <div style={{ background:'var(--bg3)', borderRadius:'8px', height:'10px', overflow:'hidden' }}>
            <div style={{ background:'#8b5cf6', height:'100%', width:`${pct}%`, transition:'width 0.3s' }} />
          </div>
          <div style={{ fontSize:'12px', color:'var(--text3)', marginTop:'6px' }}>
            {progress.total > 0
              ? `${progress.done}/${progress.total} — ${progress.platform === 'facebook' ? '📘' : progress.platform === 'instagram' ? '📸' : ''} ${progress.keyword || ''}${progress.skipped ? ' (salteado, ya se corrió hace <5min)' : ''}`
              : 'Iniciando...'}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'10px', padding:'12px 16px', fontSize:'13px', color:'#f87171' }}>
          {error}
        </div>
      )}

      {results && (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ fontSize:'13px', color:'var(--text3)' }}>{results.length} resultado{results.length !== 1 ? 's' : ''}</div>
          {results.length === 0 && (
            <div style={{ fontSize:'13px', color:'var(--text3)' }}>Sin matches — probá con otro count o revisá las keywords.</div>
          )}
          {results.map((r, i) => (
            <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'10px', padding:'14px 16px' }}>
              <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'6px' }}>
                <span style={{ fontSize:'11px', fontWeight:'700', color: r.source === 'FACEBOOK' ? '#1877f2' : '#e1306c' }}>
                  {r.source === 'FACEBOOK' ? '📘 Facebook' : '📸 Instagram'}
                </span>
                <span style={{ fontSize:'11px', color:'var(--text3)' }}>keyword: {r.keyword}</span>
                {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:'11px', color:'var(--accent2)' }}>ver post ↗</a>}
              </div>
              <div style={{ fontSize:'13px', marginBottom:'8px' }}>{r.content?.slice(0, 300)}</div>
              <div style={{ fontSize:'12px', color:'var(--text3)' }}>
                💬 {r.extra?.comments?.length || 0} comentarios
                {r.extra?.commentsTopWords?.length > 0 && (
                  <> · top palabras: {r.extra.commentsTopWords.map(w => `${w.word} (${w.count})`).join(', ')}</>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div>
          <div style={{ fontSize:'13px', fontWeight:'700', color:'var(--text2)', marginBottom:'8px' }}>🕘 Historial de corridas</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {history.map(h => (
              <div key={h.id} style={{ display:'flex', gap:'10px', alignItems:'center', fontSize:'12px', color:'var(--text3)', background:'var(--bg3)', borderRadius:'6px', padding:'6px 10px' }}>
                <span>{h.status === 'done' ? '✅' : h.status === 'error' ? '❌' : '⏳'}</span>
                <span>{(() => { try { const d = h.startedAt?.toDate ? h.startedAt.toDate() : new Date(h.startedAt?._seconds ? h.startedAt._seconds * 1000 : h.startedAt); return d.toLocaleString('es-AR'); } catch { return '—'; } })()}</span>
                <span>{(h.keywords || []).join(', ')}</span>
                <span>{(h.platforms || []).join('+')}</span>
                {h.status === 'done' && <span style={{ color:'var(--text2)' }}>{h.saved ?? 0} guardadas{h.skipped ? `, ${h.skipped} salteadas` : ''}</span>}
                {h.status === 'error' && <span style={{ color:'#f87171' }}>{h.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout, loading:authLoading } = useAuth();
  const router = useRouter();

  // State
  const [campaigns, setCampaigns]           = useState([]);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [keywords, setKeywords]             = useState([]);
  const [mentions, setMentions]             = useState([]);
  const [analytics, setAnalytics]           = useState(null);
  const [timeseries, setTimeseries]         = useState([]);
  const [loading, setLoading]               = useState(true);
  const [activeTab, setActiveTab]           = useState('feed');
  const [unreadCount, setUnreadCount]       = useState(0);

  // Filters
  const [sourceFilter, setSourceFilter]     = useState('ALL');
  const [sentimentFilter, setSentimentFilter] = useState('ALL');
  const [searchQuery, setSearchQuery]       = useState('');
  const [feedHours, setFeedHours]           = useState(0);
  const [mentionPage, setMentionPage]       = useState(1);
  const [selectedKeywordId, setSelectedKeywordId] = useState(null);
  const [totalMentions, setTotalMentions]   = useState(0);
  const [period, setPeriod]                 = useState('30d');

  // Geo filter
  const [selectedProvincia, setSelectedProvincia] = useState('');
  const [selectedCiudad, setSelectedCiudad]       = useState('');

  // Modals
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [selectedMention, setSelectedMention] = useState(null);
  const [showNewKeyword, setShowNewKeyword]   = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [enableWarmup, setEnableWarmup]       = useState(false);
  const [newKeyword, setNewKeyword]           = useState('');
  const [newKeywordTags, setNewKeywordTags]   = useState('');

  // Socket
  const { socket } = useSocket(activeCampaign?.id);

  const ciudades = selectedProvincia ? (ARGENTINA_GEO[selectedProvincia] || []) : [];

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading]);

  // ── Load campaigns ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    campaignsAPI.list().then(cs => {
      setCampaigns(cs);
      if (cs.length > 0) setActiveCampaign(cs[0]);
    }).catch(() => toast.error('Error cargando campañas'));
  }, [user]);

  // ── Load geo from campaign ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeCampaign?.description) return;
    try {
      if (activeCampaign.description.startsWith('{')) {
        const geo = JSON.parse(activeCampaign.description);
        setSelectedProvincia(geo.provincia || '');
        setSelectedCiudad(geo.ciudad || '');
      }
    } catch {}
  }, [activeCampaign?.id]);

  // ── Save geo to campaign ────────────────────────────────────────────────────
  async function saveGeo(provincia, ciudad) {
    if (!activeCampaign) return;
    try {
      await campaignsAPI.update(activeCampaign.id, { provincia, ciudad });
    } catch {}
  }

  // ── Load keywords ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeCampaign) return;
    keywordsAPI.list(activeCampaign.id).then(setKeywords).catch(()=>{});
  }, [activeCampaign?.id]);

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!activeCampaign) return;
    setLoading(true);
    try {
      // El filtro geográfico se aplica en el SCRAPING, no filtrar por texto en el feed
      const fromDate = feedHours > 0
        ? new Date(Date.now() - feedHours * 3600000).toISOString()
        : null;

      const [mentionsData, analyticsData, timeseriesData] = await Promise.all([
        mentionsAPI.list({
          campaignId: activeCampaign.id,
          ...(sourceFilter !== 'ALL' && { source: sourceFilter }),
          ...(sentimentFilter !== 'ALL' && { sentiment: sentimentFilter }),
          ...(searchQuery && { search: searchQuery }),
          ...(selectedKeywordId && { keywordId: selectedKeywordId }),
          ...(fromDate && { from: fromDate }),
          page: mentionPage, limit: 20,
        }),
        analyticsAPI.summary({ campaignId: activeCampaign.id, period }),
        analyticsAPI.timeseries({ campaignId: activeCampaign.id, period }),
      ]);

      setMentions(mentionsData.mentions || []);
      setTotalMentions(mentionsData.pagination?.total || 0);
      setAnalytics(analyticsData);
      setTimeseries(timeseriesData.series || []);

      // Unread count
      mentionsAPI.unread(activeCampaign.id).then(setUnreadCount).catch(()=>{});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeCampaign, sourceFilter, sentimentFilter, searchQuery, mentionPage, feedHours, period, selectedKeywordId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Descargar TODAS las menciones que matchean los filtros actuales del
  // feed (no solo la página de 20 que está en pantalla).
  const [exportingMentions, setExportingMentions] = useState(false);
  async function exportAllMentions(kind) {
    if (!activeCampaign || exportingMentions) return;
    setExportingMentions(true);
    try {
      const fromDate = feedHours > 0 ? new Date(Date.now() - feedHours * 3600000).toISOString() : null;
      const data = await mentionsAPI.list({
        campaignId: activeCampaign.id,
        ...(sourceFilter !== 'ALL' && { source: sourceFilter }),
        ...(sentimentFilter !== 'ALL' && { sentiment: sentimentFilter }),
        ...(searchQuery && { search: searchQuery }),
        ...(selectedKeywordId && { keywordId: selectedKeywordId }),
        ...(fromDate && { from: fromDate }),
        page: 1, limit: 100000,
      });
      const all = data.mentions || [];
      if (all.length === 0) { toast.error('No hay menciones para descargar con estos filtros'); return; }
      const stamp = format(new Date(), 'yyyy-MM-dd_HHmm');
      if (kind === 'xlsx') {
        downloadMentionsXLSX(all, `menciones_${activeCampaign.name}_${stamp}.xlsx`);
      } else {
        downloadMentionsTXT(all, `menciones_${activeCampaign.name}_${stamp}.txt`, `Menciones — ${activeCampaign.name}`);
      }
      toast.success(`${all.length} menciones descargadas`);
    } catch (err) {
      toast.error('Error al exportar menciones');
    } finally {
      setExportingMentions(false);
    }
  }

  // ── Socket real-time ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onNew = (data) => {
      const newMentions = data.mentions || [];
      if (newMentions.length > 0) {
        setMentions(prev => [...newMentions, ...prev]
          .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
          .slice(0, 50));
        setTotalMentions(p => p + (data.count || newMentions.length));
        setUnreadCount(p => p + (data.count || newMentions.length));
        toast(`📡 ${data.count || newMentions.length} menciones nuevas`, { icon:'🔔', duration:4000 });
      } else if (data.count > 0) {
        loadData();
        toast(`📡 ${data.count} menciones nuevas`, { icon:'🔔', duration:4000 });
      }
    };
    socket.on('mentions:new', onNew);
    return () => socket.off('mentions:new', onNew);
  }, [socket, loadData]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function createCampaign() {
    if (!newCampaignName.trim()) return;
    try {
      const c = await campaignsAPI.create({ name: newCampaignName, enableWarmup });
      setCampaigns(p => [...p, c]);
      setActiveCampaign(c);
      setNewCampaignName('');
      setEnableWarmup(false);
      setShowNewCampaign(false);
      toast.success('Campaña creada');
    } catch { toast.error('Error al crear campaña'); }
  }

  async function deleteCampaign() {
    if (!activeCampaign) return;
    if (!confirm(`¿Eliminar "${activeCampaign.name}" y todas sus menciones?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      await campaignsAPI.delete(activeCampaign.id);
      const rest = campaigns.filter(c => c.id !== activeCampaign.id);
      setCampaigns(rest);
      setActiveCampaign(rest[0] || null);
      toast.success('Campaña eliminada');
    } catch { toast.error('Error al eliminar campaña'); }
  }

  async function createKeyword() {
    if (!newKeyword.trim() || !activeCampaign) return;
    const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4'];
    try {
      const kw = await keywordsAPI.create({
        term: newKeyword.trim(),
        campaignId: activeCampaign.id,
        color: COLORS[keywords.length % COLORS.length],
        tags: newKeywordTags,
      });
      setKeywords(p => [...p, kw]);
      setNewKeyword('');
      setNewKeywordTags('');
      setShowNewKeyword(false);
      toast.success(`Keyword "${kw.term}" agregada`);
    } catch (err) { toast.error(err.response?.data?.error || 'Error al agregar keyword'); }
  }

  async function editKeywordTags(kw) {
    const current = (kw.tags || []).join(', ');
    const input = prompt(`Etiquetas para "${kw.term}" (separadas por coma)\nEj: Rio Grande, Municipio de Rio Grande, Politica`, current);
    if (input === null) return;
    try {
      const updated = await keywordsAPI.update(kw.id, { tags: input });
      setKeywords(p => p.map(k => k.id === kw.id ? updated : k));
      toast.success('Etiquetas actualizadas');
    } catch { toast.error('Error al actualizar etiquetas'); }
  }

  async function deleteKeyword(id) {
    try {
      await keywordsAPI.delete(id);
      setKeywords(p => p.filter(k => k.id !== id));
      toast.success('Keyword eliminada');
    } catch { toast.error('Error al eliminar keyword'); }
  }

  async function deleteMention(id) {
    try {
      await mentionsAPI.delete(id);
      setMentions(p => p.filter(m => m.id !== id));
      setTotalMentions(p => p - 1);
    } catch {}
  }

  if (authLoading || !user) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ textAlign:'center', color:'var(--text3)' }}>
        <div style={{ fontSize:'32px', marginBottom:'12px' }}>📡</div>
        <p>Cargando...</p>
      </div>
    </div>
  );

  const sentMap = {};
  (analytics?.bySentiment || []).forEach(s => { sentMap[s.sentiment] = s.count; });
  const totalSent = Object.values(sentMap).reduce((a,b)=>a+b,0) || 1;
  const posPercent = Math.round(((sentMap.POSITIVE||0)/totalSent)*100);
  const negPercent = Math.round(((sentMap.NEGATIVE||0)/totalSent)*100);

  // Preparar datos para gráfico de sentimiento (donut)
  const sentData = [
    { name:'Positivo', value: sentMap.POSITIVE||0, color:'#10b981' },
    { name:'Negativo', value: sentMap.NEGATIVE||0, color:'#ef4444' },
    { name:'Neutral',  value: sentMap.NEUTRAL||0,  color:'#475569' },
  ].filter(d => d.value > 0);

  // Source data para bar chart
  const sourceData = (analytics?.bySource || []).map(s => ({
    name: SOURCE_META[s.source]?.label || s.source,
    menciones: s.count,
    alcance: s.reach,
    color: SOURCE_META[s.source]?.color || '#64748b',
  }));

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>

      {/* ══ TOPBAR ════════════════════════════════════════════════════════════ */}
      <header className="dash-topbar">
        <div className="tb-left">
          <div className="tb-logo">
            <div className="tb-logo-icon">📡</div>
            <span className="tb-logo-text">Politica<span>Monitor</span></span>
          </div>
          <div className="live-badge">
            <div className="live-dot" />
            <span className="live-text">EN VIVO</span>
          </div>
          {activeCampaign?.status === 'WARMING_UP' && (
            <div className="warmup-badge">
              <div className="live-dot" style={{ background:'var(--warning)' }} />
              <span style={{ fontSize:'11px', fontWeight:'700', color:'var(--warning)' }}>WARMUP</span>
            </div>
          )}
          {activeCampaign?.lastScraped && (
            <span className="tb-scan-status">
              Scan: {timeAgo(activeCampaign.lastScraped)}
              {activeCampaign.lastScrapeCount > 0 && ` (+${activeCampaign.lastScrapeCount})`}
            </span>
          )}
        </div>

        <div className="tb-right">
          <select className="tb-campaign-select" value={activeCampaign?.id||''} onChange={e=>{
            const c = campaigns.find(x=>x.id===e.target.value);
            if(c){setActiveCampaign(c);setMentionPage(1);}
          }}>
            {campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <button className="tb-btn tb-btn-accent" onClick={()=>setShowNewCampaign(true)}>+</button>

          {user?.role === 'ADMIN' && activeCampaign && (
            <button className="tb-btn tb-btn-danger" onClick={deleteCampaign} title="Eliminar campaña">🗑</button>
          )}

          <div className="tb-nav-btns">
            {user?.role === 'ADMIN' && (
              <button className="tb-btn" onClick={()=>router.push('/users')}>👥</button>
            )}
            <button className="tb-btn" onClick={()=>router.push('/reports')}>📊</button>
            <button className="tb-btn tb-btn-warn" onClick={()=>router.push('/analyzer')}>🔬</button>
          </div>

          <div className="tb-user">
            <span className="tb-user-name">{user?.name?.split(' ')[0]}</span>
            <button className="tb-btn-logout" onClick={logout}>Salir</button>
          </div>
        </div>
      </header>

      {/* Nav mobile: el sidebar se oculta en pantallas chicas, esta barra la reemplaza */}
      <nav className="mobile-tab-bar">
        {[
          { id:'feed',     icon:'📡', label:'Feed', badge: unreadCount > 0 ? unreadCount : null },
          { id:'analysis', icon:'📊', label:'Análisis' },
          { id:'keywords', icon:'🔑', label:'Keywords' },
          { id:'sources',  icon:'🌐', label:'Páginas' },
          { id:'scraper-test', icon:'🧪', label:'Prueba' },
        ].map(tab => (
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={activeTab===tab.id ? 'mobile-tab-btn active' : 'mobile-tab-btn'}>
            <span>{tab.icon} {tab.label}</span>
            {tab.badge && <span className="mobile-tab-badge">{tab.badge > 99 ? '99+' : tab.badge}</span>}
          </button>
        ))}
      </nav>

      {/* ══ BODY ══════════════════════════════════════════════════════════════ */}
      <div className="dash-body">

        {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
        <aside className="dash-sidebar">

          {/* Nav */}
          <nav style={{ padding:'12px 10px' }}>
            {[
              { id:'feed',     icon:'📡', label:'Feed en vivo', badge: unreadCount > 0 ? unreadCount : null },
              { id:'analysis', icon:'📊', label:'Análisis' },
              { id:'keywords', icon:'🔑', label:'Palabras clave' },
              { id:'sources',  icon:'🌐', label:'Mis páginas' },
              { id:'scraper-test', icon:'🧪', label:'Realizar prueba' },
            ].map(tab => (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                width:'100%', padding:'9px 12px', borderRadius:'8px', border:'none',
                background: activeTab===tab.id ? 'rgba(59,130,246,0.12)' : 'none',
                color: activeTab===tab.id ? '#60a5fa' : 'var(--text2)',
                fontSize:'13px', fontWeight: activeTab===tab.id ? '700' : '500',
                cursor:'pointer', textAlign:'left', marginBottom:'2px',
                borderLeft: activeTab===tab.id ? '3px solid #3b82f6' : '3px solid transparent',
              }}>
                <span>{tab.icon} {tab.label}</span>
                {tab.badge && (
                  <span style={{ background:'#ef4444', color:'#fff', borderRadius:'10px', padding:'1px 6px', fontSize:'10px', fontWeight:'800' }}>{tab.badge > 99 ? '99+' : tab.badge}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Geo filter */}
          <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:'10px', color:'var(--text3)', fontWeight:'700', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>🗺️ Filtro geográfico</div>
            <select value={selectedProvincia} onChange={e=>{
              const p=e.target.value; setSelectedProvincia(p); setSelectedCiudad(''); setMentionPage(1); saveGeo(p,'');
            }} style={{ width:'100%', fontSize:'12px', padding:'6px 8px', marginBottom:'6px', borderRadius:'6px', background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)' }}>
              <option value=''>Todas las provincias</option>
              {Object.keys(ARGENTINA_GEO).map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            {selectedProvincia && (
              <select value={selectedCiudad} onChange={e=>{
                const c=e.target.value; setSelectedCiudad(c); setMentionPage(1); saveGeo(selectedProvincia,c);
              }} style={{ width:'100%', fontSize:'12px', padding:'6px 8px', borderRadius:'6px', background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)' }}>
                <option value=''>Todas las ciudades</option>
                {ciudades.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {(selectedProvincia||selectedCiudad) && (
              <button onClick={()=>{setSelectedProvincia('');setSelectedCiudad('');saveGeo('','');}} style={{ marginTop:'6px', width:'100%', background:'none', border:'1px solid var(--border)', color:'var(--text3)', borderRadius:'6px', padding:'4px', fontSize:'11px', cursor:'pointer' }}>✕ Limpiar</button>
            )}
          </div>

          {/* Keywords activas */}
          <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
              <div style={{ fontSize:'10px', color:'var(--text3)', fontWeight:'700', textTransform:'uppercase', letterSpacing:'1px' }}>🔑 Keywords</div>
              {user?.role !== 'VIEWER' && (
                <button onClick={()=>setShowNewKeyword(true)} style={{ background:'none', border:'none', color:'var(--accent2)', cursor:'pointer', fontSize:'16px', lineHeight:1 }}>+</button>
              )}
            </div>
            {keywords.map(kw => {
              const kwCount = (analytics?.byKeyword||[]).find(b=>b.keywordId===kw.id)?._count || 0;
              const isActive = selectedKeywordId === kw.id;
              return (
                <div key={kw.id}
                  onClick={() => { setSelectedKeywordId(isActive ? null : kw.id); setMentionPage(1); setActiveTab('feed'); }}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'6px 8px', borderRadius:'7px', marginBottom:'2px', cursor:'pointer',
                    background: isActive ? `${kw.color}20` : 'transparent',
                    border: isActive ? `1px solid ${kw.color}40` : '1px solid transparent',
                    transition:'all .15s',
                  }}
                  onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background='var(--bg3)'; }}
                  onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background='transparent'; }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 }}>
                    <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:kw.color, flexShrink:0 }}/>
                    <span style={{ fontSize:'12px', color: isActive ? kw.color : 'var(--text2)', fontWeight: isActive ? '700' : '500', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{kw.term}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'4px', flexShrink:0 }}>
                    <span style={{ fontSize:'11px', color: isActive ? kw.color : 'var(--text3)', fontWeight: isActive ? '700' : '400' }}>{kwCount}</span>
                    {user?.role !== 'VIEWER' && (
                      <button onClick={e=>{ e.stopPropagation(); deleteKeyword(kw.id); }}
                        style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:'13px', opacity:0, lineHeight:1, padding:'0 2px' }}
                        onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=0}>×</button>
                    )}
                  </div>
                </div>
              );
            })}
            {keywords.length === 0 && (
              <p style={{ fontSize:'12px', color:'var(--text3)', textAlign:'center', padding:'12px 0' }}>Sin keywords activas</p>
            )}
          </div>
        </aside>

        {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
        <main className="dash-main">

          {/* Geo banner */}
          {(selectedProvincia || selectedCiudad) && (
            <div style={{ background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:'10px', padding:'10px 16px', display:'flex', alignItems:'center', gap:'10px', fontSize:'13px' }}>
              <span>📍</span>
              <span>Filtrando por: <strong style={{ color:'#60a5fa' }}>{[selectedCiudad, selectedProvincia].filter(Boolean).join(', ')}</strong></span>
              <button onClick={()=>{setSelectedProvincia('');setSelectedCiudad('');saveGeo('','');}} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:'18px', lineHeight:1 }}>×</button>
            </div>
          )}

          {/* ── KPI CARDS ──────────────────────────────────────────────────── */}
          <div className="dash-kpis">
            <KpiCard label="Menciones totales" value={fmtNum(analytics?.mentions?.total||0)}
              sub={`período ${period}`} trend={analytics?.mentions?.delta} color="var(--accent)" />
            <KpiCard label="Sentimiento positivo" value={`${posPercent}%`}
              sub="período actual" color="var(--positive)" />
            <KpiCard label="Sentimiento negativo" value={`${negPercent}%`}
              sub={negPercent > 30 ? '⚠️ alto' : 'bajo control'} color="var(--negative)" />
            <KpiCard label="Alcance estimado" value={fmtNum(analytics?.reach||0)}
              sub="personas impactadas" color="var(--purple)" />
          </div>

          {/* ── TAB: FEED ──────────────────────────────────────────────────── */}
          {activeTab === 'feed' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

              {/* Feed header */}
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'12px', padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
                  <div>
                    <span style={{ fontSize:'14px', fontWeight:'700' }}>Feed de menciones</span>
                    <span style={{ fontSize:'12px', color:'var(--text3)', marginLeft:'8px' }}>
                      {totalMentions.toLocaleString()} menciones · {feedHours===0?'todo el historial':`últimas ${feedHours}h`}
                      {selectedKeywordId && keywords.find(k=>k.id===selectedKeywordId) && (
                        <span style={{ marginLeft:'6px', color: keywords.find(k=>k.id===selectedKeywordId)?.color, fontWeight:'700' }}>
                          · #{keywords.find(k=>k.id===selectedKeywordId)?.term}
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:'8px' }}>
                    {selectedKeywordId && (
                      <button onClick={()=>{ setSelectedKeywordId(null); setMentionPage(1); }}
                        style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', color:'#f87171', borderRadius:'6px', padding:'5px 10px', cursor:'pointer', fontSize:'11px', fontWeight:'600' }}>
                        ✕ Quitar filtro
                      </button>
                    )}
                    <button onClick={()=>exportAllMentions('xlsx')} disabled={exportingMentions} style={{ background:'none', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:'8px', padding:'5px 12px', cursor: exportingMentions?'wait':'pointer', fontSize:'12px', opacity: exportingMentions?0.6:1 }}>⬇️ Excel</button>
                    <button onClick={()=>exportAllMentions('txt')} disabled={exportingMentions} style={{ background:'none', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:'8px', padding:'5px 12px', cursor: exportingMentions?'wait':'pointer', fontSize:'12px', opacity: exportingMentions?0.6:1 }}>⬇️ TXT</button>
                    <button onClick={loadData} style={{ background:'none', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:'8px', padding:'5px 12px', cursor:'pointer', fontSize:'12px' }}>↻ Actualizar</button>
                  </div>
                </div>

                {/* Filters row */}
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
                  <select value={feedHours} onChange={e=>{setFeedHours(Number(e.target.value));setMentionPage(1);}} style={{ padding:'5px 10px', borderRadius:'20px', border:'1px solid var(--border)', fontSize:'12px', fontWeight:'600', background:'var(--bg3)', color:'var(--text2)', cursor:'pointer' }}>
                    <option value={0}>📅 Todo el historial</option>
                    <option value={6}>⏱ 6 horas</option>
                    <option value={24}>⏱ 24 horas</option>
                    <option value={48}>⏱ 48 horas</option>
                    <option value={168}>⏱ 7 días</option>
                    <option value={720}>⏱ 30 días</option>
                  </select>

                  <input value={searchQuery} onChange={e=>{setSearchQuery(e.target.value);setMentionPage(1);}} placeholder="🔍 Buscar..." style={{ padding:'5px 12px', borderRadius:'20px', border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text)', fontSize:'12px', width:'140px' }}/>

                  {['ALL','WEB','NEWS','FACEBOOK','INSTAGRAM','TWITTER'].map(src=>(
                    <button key={src} onClick={()=>{setSourceFilter(src);setMentionPage(1);}} style={{ padding:'5px 12px', borderRadius:'20px', border:'1px solid var(--border)', fontSize:'12px', fontWeight:'600', cursor:'pointer',
                      background: sourceFilter===src ? (SOURCE_META[src]?.color||'var(--accent)') : 'var(--bg3)',
                      color: sourceFilter===src ? '#fff' : 'var(--text2)' }}>
                      {src==='ALL'?'Todos':`${SOURCE_META[src]?.icon||''} ${SOURCE_META[src]?.label||src}`}
                    </button>
                  ))}

                  {['ALL','POSITIVE','NEGATIVE','NEUTRAL'].map(sent=>(
                    <button key={sent} onClick={()=>{setSentimentFilter(sent);setMentionPage(1);}} style={{ padding:'5px 10px', borderRadius:'20px', border:'1px solid var(--border)', fontSize:'12px', fontWeight:'600', cursor:'pointer',
                      background: sentimentFilter===sent ? (SENT_META[sent]?.color||'var(--accent)') : 'transparent',
                      color: sentimentFilter===sent ? '#fff' : 'var(--text3)' }}>
                      {sent==='ALL'?'😊⚠️😐':`${SENT_META[sent]?.icon||''} ${SENT_META[sent]?.label||sent}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mention cards */}
              {loading ? (
                <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Cargando menciones...</div>
              ) : mentions.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'12px' }}>
                  <div style={{ fontSize:'48px', marginBottom:'16px' }}>📡</div>
                  <h3 style={{ fontSize:'16px', fontWeight:'700', marginBottom:'8px' }}>Sin menciones todavía</h3>
                  <p style={{ color:'var(--text3)', fontSize:'14px' }}>Agregá keywords y esperá el próximo ciclo de scraping (cada 15 min)</p>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {mentions.map(m => <MentionCard key={m.id} mention={m} onDelete={deleteMention} onClick={setSelectedMention}/>)}
                  </div>
                  {/* Pagination */}
                  {totalMentions > 20 && (
                    <div style={{ display:'flex', justifyContent:'center', gap:'8px', marginTop:'8px' }}>
                      <button disabled={mentionPage<=1} onClick={()=>setMentionPage(p=>p-1)} style={{ padding:'7px 16px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text2)', cursor: mentionPage<=1?'not-allowed':'pointer', opacity:mentionPage<=1?0.4:1, fontSize:'13px' }}>← Anterior</button>
                      <span style={{ padding:'7px 14px', fontSize:'13px', color:'var(--text3)' }}>Pág {mentionPage} de {Math.ceil(totalMentions/20)}</span>
                      <button disabled={mentionPage>=Math.ceil(totalMentions/20)} onClick={()=>setMentionPage(p=>p+1)} style={{ padding:'7px 16px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text2)', cursor: mentionPage>=Math.ceil(totalMentions/20)?'not-allowed':'pointer', opacity:mentionPage>=Math.ceil(totalMentions/20)?0.4:1, fontSize:'13px' }}>Siguiente →</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── TAB: ANALYSIS ──────────────────────────────────────────────── */}
          {activeTab === 'analysis' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

              {/* Period selector */}
              <div style={{ display:'flex', gap:'6px' }}>
                {[['1h','1h'],['24h','24h'],['7d','7 días'],['30d','30 días']].map(([val,label])=>(
                  <button key={val} onClick={()=>setPeriod(val)} style={{ padding:'6px 14px', borderRadius:'8px', border:'1px solid var(--border)', background: period===val?'var(--accent)':'var(--bg3)', color: period===val?'#fff':'var(--text2)', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}>{label}</button>
                ))}
              </div>

              {/* Volume chart */}
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>📈 Volumen de menciones</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timeseries}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                    <XAxis dataKey="time" tick={{ fontSize:11, fill:'#64748b' }} tickFormatter={v=>{ try{return format(new Date(v),'HH:mm',{locale:es})}catch{return v} }}/>
                    <YAxis tick={{ fontSize:11, fill:'#64748b' }}/>
                    <Tooltip contentStyle={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'8px', fontSize:'12px' }} labelFormatter={v=>{ try{return format(new Date(v),'dd/MM HH:mm',{locale:es})}catch{return v} }}/>
                    <Legend wrapperStyle={{ fontSize:'12px' }}/>
                    <Area type="monotone" dataKey="total" name="Total" stroke="#3b82f6" fill="url(#colorTotal)" strokeWidth={2}/>
                    <Area type="monotone" dataKey="positive" name="Positivo" stroke="#10b981" fill="url(#colorPos)" strokeWidth={1.5}/>
                    <Area type="monotone" dataKey="negative" name="Negativo" stroke="#ef4444" fill="url(#colorNeg)" strokeWidth={1.5}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Mentions calendar heatmap */}
              <MentionsHeatmap mentions={mentions} />

              {/* Sentiment + Sources row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'16px' }}>
                {/* Sentiment donut */}
                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                  <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>🎯 Sentimiento</div>
                  <div style={{ display:'flex', alignItems:'center', gap:'20px' }}>
                    <ResponsiveContainer width={140} height={140}>
                      <PieChart>
                        <Pie data={sentData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value">
                          {sentData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                        </Pie>
                        <Tooltip formatter={(v)=>[v,'menciones']}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ flex:1 }}>
                      {[
                        { label:'Positivo', val:sentMap.POSITIVE||0, color:'#10b981', pct:posPercent },
                        { label:'Negativo', val:sentMap.NEGATIVE||0, color:'#ef4444', pct:negPercent },
                        { label:'Neutral',  val:sentMap.NEUTRAL||0,  color:'#475569', pct:100-posPercent-negPercent },
                      ].map(s=>(
                        <div key={s.label} style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                            <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:s.color }}/>
                            <span style={{ fontSize:'12px', color:'var(--text2)' }}>{s.label}</span>
                          </div>
                          <div style={{ textAlign:'right' }}>
                            <span style={{ fontSize:'14px', fontWeight:'700', color:s.color }}>{s.pct}%</span>
                            <span style={{ fontSize:'11px', color:'var(--text3)', marginLeft:'6px' }}>{fmtNum(s.val)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sources bar chart */}
                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                  <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>📡 Por fuente</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={sourceData} layout="vertical">
                      <XAxis type="number" tick={{ fontSize:10, fill:'#64748b' }}/>
                      <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:'#64748b' }} width={70}/>
                      <Tooltip contentStyle={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'8px', fontSize:'12px' }}/>
                      <Bar dataKey="menciones" radius={[0,4,4,0]}>
                        {sourceData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top mentions */}
              {analytics?.topMentions?.length > 0 && (
                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                  <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>🔥 Menciones con mayor alcance</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {analytics.topMentions.map(m=>{
                      const titleMatch = (m.content||'').match(/^\[([^\]]+)\]/);
                      const title = titleMatch ? titleMatch[1] : (m.content||'').slice(0,100);
                      return (
                        <div key={m.id} style={{ display:'flex', gap:'12px', padding:'10px 12px', background:'var(--bg3)', borderRadius:'8px', alignItems:'flex-start' }}>
                          <Badge source={m.source}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            {m.sourceUrl ? (
                              <a href={m.sourceUrl} target="_blank" rel="noreferrer"
                                style={{ display:'block', fontSize:'13px', fontWeight:'600', color:'var(--text)', textDecoration:'none', marginBottom:'4px', lineHeight:'1.4' }}
                                onMouseEnter={e=>e.target.style.color='#60a5fa'}
                                onMouseLeave={e=>e.target.style.color='var(--text)'}>
                                {title}
                              </a>
                            ) : (
                              <p style={{ fontSize:'13px', fontWeight:'600', color:'var(--text)', marginBottom:'4px' }}>{title}</p>
                            )}
                            <div style={{ display:'flex', gap:'10px', fontSize:'11px', color:'var(--text3)', alignItems:'center' }}>
                              <span>👁️ {fmtNum(m.reach)}</span>
                              <span>— {m.sourceName}</span>
                              {m.sourceUrl && (
                                <a href={m.sourceUrl} target="_blank" rel="noreferrer"
                                  style={{ color:'#60a5fa', textDecoration:'none', fontWeight:'600' }}>Ver nota →</a>
                              )}
                            </div>
                          </div>
                          <SentBadge sentiment={m.sentiment}/>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: KEYWORDS ──────────────────────────────────────────────── */}
          {activeTab === 'keywords' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <h2 style={{ fontSize:'16px', fontWeight:'700' }}>🔑 Palabras clave monitoreadas</h2>
                {user?.role !== 'VIEWER' && (
                  <button onClick={()=>setShowNewKeyword(true)} className="btn btn-primary" style={{ fontSize:'13px' }}>+ Agregar keyword</button>
                )}
              </div>
              {keywords.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'12px' }}>
                  <div style={{ fontSize:'40px', marginBottom:'12px' }}>🔑</div>
                  <p style={{ color:'var(--text3)' }}>Agregá keywords para empezar a monitorear</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {keywords.map(kw => {
                    const kwData = (analytics?.byKeyword||[]).find(b=>b.keywordId===kw.id);
                    const count = kwData?._count || 0;
                    return (
                      <div key={kw.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px 18px', display:'flex', alignItems:'center', gap:'14px' }}>
                        <div style={{ width:'42px', height:'42px', borderRadius:'10px', background:`${kw.color}20`, border:`2px solid ${kw.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>🔑</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:'700', fontSize:'15px', color:'var(--text)', marginBottom:'4px' }}>{kw.term}</div>
                          <div style={{ fontSize:'12px', color:'var(--text3)', marginBottom: (kw.tags||[]).length ? '6px' : 0 }}>{count} menciones en el período</div>
                          {(kw.tags||[]).length > 0 && (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                              {kw.tags.map((t,i) => (
                                <span key={i} style={{ fontSize:'11px', color:'var(--text2)', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'20px', padding:'2px 9px' }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ background:`${kw.color}15`, border:`1px solid ${kw.color}30`, color:kw.color, borderRadius:'8px', padding:'6px 14px', fontSize:'13px', fontWeight:'700' }}>{count}</div>
                        {user?.role !== 'VIEWER' && (
                          <button onClick={()=>editKeywordTags(kw)} title="Editar etiquetas" style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:'8px', padding:'6px 10px', cursor:'pointer', fontSize:'13px' }}>🏷️</button>
                        )}
                        {user?.role !== 'VIEWER' && (
                          <button onClick={()=>deleteKeyword(kw.id)} style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', color:'#f87171', borderRadius:'8px', padding:'6px 10px', cursor:'pointer', fontSize:'13px' }}>🗑</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: SOURCES ───────────────────────────────────────────────── */}
          {activeTab === 'sources' && (
            <div>
              <iframe src="/sources" style={{ border:'none', width:'100%', height:'calc(100vh - 140px)', borderRadius:'12px', overflow:'hidden' }}/>
            </div>
          )}

          {/* ── TAB: SOCIAL ───────────────────────────────────────────────── */}
          <div style={{ display: activeTab === 'scraper-test' ? 'block' : 'none' }}>
            <ScraperTestPanel campaignId={activeCampaign?.id} />
          </div>

        </main>
      </div>

      {/* ══ MODALS ════════════════════════════════════════════════════════════ */}
      {showNewCampaign && (
        <Modal title="📡 Nueva campaña" onClose={()=>setShowNewCampaign(false)}>
          <div style={{ marginBottom:'16px' }}>
            <label style={{ display:'block', fontSize:'12px', color:'var(--text3)', fontWeight:'600', marginBottom:'6px', textTransform:'uppercase' }}>Nombre de la campaña</label>
            <input value={newCampaignName} onChange={e=>setNewCampaignName(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&createCampaign()}
              placeholder="Ej: Intendente García — Córdoba 2027"
              style={{ width:'100%', boxSizing:'border-box' }}
              autoFocus/>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px', background:'var(--bg3)', borderRadius:'8px', marginBottom:'16px', cursor:'pointer', border: enableWarmup ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--border)' }}>
            <input type="checkbox" checked={enableWarmup} onChange={e=>setEnableWarmup(e.target.checked)}
              style={{ width:'18px', height:'18px', accentColor:'#3b82f6', cursor:'pointer' }}/>
            <div>
              <div style={{ fontSize:'13px', fontWeight:'600', color: enableWarmup ? '#60a5fa' : 'var(--text2)' }}>Análisis inicial intensivo (1 hora)</div>
              <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'2px' }}>Busca menciones de las últimas 48hs cada 3 minutos durante 1 hora para poner la campaña al día.</div>
            </div>
          </label>
          <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
            <button className="btn btn-ghost" onClick={()=>setShowNewCampaign(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={createCampaign}>Crear campaña</button>
          </div>
        </Modal>
      )}

      {showNewKeyword && (
        <Modal title="🔑 Nueva palabra clave" onClose={()=>setShowNewKeyword(false)}>
          <div style={{ marginBottom:'16px' }}>
            <label style={{ display:'block', fontSize:'12px', color:'var(--text3)', fontWeight:'600', marginBottom:'6px', textTransform:'uppercase' }}>Keyword a monitorear</label>
            <input value={newKeyword} onChange={e=>setNewKeyword(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&createKeyword()}
              placeholder="Ej: García Morales"
              style={{ width:'100%', boxSizing:'border-box' }}
              autoFocus/>
          </div>
          <div style={{ marginBottom:'16px' }}>
            <label style={{ display:'block', fontSize:'12px', color:'var(--text3)', fontWeight:'600', marginBottom:'6px', textTransform:'uppercase' }}>Etiquetas de zona/tema (opcional)</label>
            <input value={newKeywordTags} onChange={e=>setNewKeywordTags(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&createKeyword()}
              placeholder="Ej: Rio Grande, Municipio de Rio Grande, Politica"
              style={{ width:'100%', boxSizing:'border-box' }}/>
          </div>
          <div style={{ fontSize:'12px', color:'var(--text3)', background:'var(--bg3)', padding:'10px', borderRadius:'8px', marginBottom:'16px' }}>
            💡 El sistema buscará esta keyword en toda la web, Facebook, Instagram y Twitter de la zona seleccionada. No agregues la provincia — eso se configura en el filtro geográfico. Las etiquetas acotan la búsqueda en portales web a esa zona/tema puntual (ej: solo menciones junto a "Rio Grande").
          </div>
          <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
            <button className="btn btn-ghost" onClick={()=>setShowNewKeyword(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={createKeyword}>Agregar keyword</button>
          </div>
        </Modal>
      )}

      {selectedMention && (
        <MentionDetailModal mention={selectedMention} onClose={() => setSelectedMention(null)} />
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
