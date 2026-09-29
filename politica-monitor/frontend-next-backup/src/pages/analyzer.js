// src/pages/analyzer.js — Analizador de URL individual
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const SENT_COLORS = { POSITIVE:'#10b981', NEGATIVE:'#ef4444', NEUTRAL:'#64748b' };
const SENT_ICONS  = { POSITIVE:'😊', NEGATIVE:'⚠️', NEUTRAL:'😐' };
const SENT_LABEL  = { POSITIVE:'Positivo', NEGATIVE:'Negativo', NEUTRAL:'Neutral' };

function Badge({ text, color }) {
  return (
    <span style={{ background:`${color}18`, color, border:`1px solid ${color}35`, borderRadius:'6px', padding:'2px 10px', fontSize:'11px', fontWeight:'700' }}>
      {text}
    </span>
  );
}

function CommentCard({ comment, index }) {
  const c = SENT_COLORS[comment.sentiment] || '#64748b';
  return (
    <div style={{ background:'var(--bg3)', border:`1px solid ${c}25`, borderRadius:'10px', padding:'12px 14px', marginBottom:'8px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'10px', marginBottom:'6px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:`${c}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', flexShrink:0 }}>
            {SENT_ICONS[comment.sentiment]}
          </div>
          <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--text)' }}>{comment.author || `Usuario ${index+1}`}</span>
          {comment.likes > 0 && <span style={{ fontSize:'11px', color:'var(--text3)' }}>❤️ {comment.likes}</span>}
        </div>
        <Badge text={SENT_LABEL[comment.sentiment] || 'Neutral'} color={c}/>
      </div>
      <p style={{ fontSize:'13px', color:'var(--text2)', lineHeight:'1.6', margin:0 }}>{comment.text}</p>
      {comment.score !== undefined && (
        <div style={{ marginTop:'8px', display:'flex', alignItems:'center', gap:'6px' }}>
          <div style={{ flex:1, height:'4px', borderRadius:'2px', background:'var(--border)', overflow:'hidden' }}>
            <div style={{ width:`${Math.abs(comment.score)*100}%`, height:'100%', background:c, borderRadius:'2px' }}/>
          </div>
          <span style={{ fontSize:'10px', color:'var(--text3)', fontWeight:'600' }}>{Math.round(Math.abs(comment.score)*100)}%</span>
        </div>
      )}
    </div>
  );
}

export default function Analyzer() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [url, setUrl]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');
  const [commentFilter, setCommentFilter] = useState('ALL');

  async function analyze() {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await api.post('/analyzer/analyze', { url: url.trim() });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al analizar el enlace. Verificá que sea una URL pública.');
    } finally {
      setLoading(false);
    }
  }

  function detectPlatform(url) {
    if (!url) return null;
    const u = url.toLowerCase();
    if (u.includes('facebook.com') || u.includes('fb.com')) return { name:'Facebook', icon:'📘', color:'#1877f2' };
    if (u.includes('instagram.com')) return { name:'Instagram', icon:'📸', color:'#e1306c' };
    if (u.includes('tiktok.com')) return { name:'TikTok', icon:'🎵', color:'#ff0050' };
    if (u.includes('twitter.com') || u.includes('x.com')) return { name:'Twitter/X', icon:'🐦', color:'#1da1f2' };
    if (u.includes('youtube.com') || u.includes('youtu.be')) return { name:'YouTube', icon:'▶️', color:'#ff0000' };
    return { name:'Web', icon:'🌐', color:'#64748b' };
  }

  const platform = detectPlatform(url);

  const filteredComments = result?.comments?.filter(c =>
    commentFilter === 'ALL' || c.sentiment === commentFilter
  ) || [];

  const sentimentData = result ? [
    { name:'Positivos', value: result.sentimentBreakdown?.POSITIVE || 0, color:'#10b981' },
    { name:'Negativos', value: result.sentimentBreakdown?.NEGATIVE || 0, color:'#ef4444' },
    { name:'Neutrales', value: result.sentimentBreakdown?.NEUTRAL  || 0, color:'#64748b' },
  ].filter(d=>d.value>0) : [];

  const wordData = (result?.topWords || []).slice(0, 10);

  if (!authLoading && !user) { router.push('/login'); return null; }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

      {/* HEADER */}
      <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', padding:'14px 24px', display:'flex', alignItems:'center', gap:'14px', position:'sticky', top:0, zIndex:40 }}>
        <button onClick={()=>router.push('/dashboard')} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:'20px', lineHeight:1 }}>←</button>
        <div style={{ width:'32px', height:'32px', borderRadius:'9px', background:'linear-gradient(135deg,#f59e0b,#ef4444)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>🔬</div>
        <div>
          <div style={{ fontSize:'15px', fontWeight:'800' }}>Analizador de publicaciones</div>
          <div style={{ fontSize:'11px', color:'var(--text3)' }}>Medí el impacto real de cualquier publicación</div>
        </div>
      </div>

      <div style={{ maxWidth:'1000px', margin:'0 auto', padding:'24px 20px', display:'flex', flexDirection:'column', gap:'20px' }}>

        {/* URL INPUT */}
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'24px' }}>
          <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>
            Pegá el link de la publicación a analizar
          </div>

          {/* Platform badges */}
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            {[
              { name:'Facebook', icon:'📘', color:'#1877f2' },
              { name:'Instagram', icon:'📸', color:'#e1306c' },
              { name:'TikTok', icon:'🎵', color:'#ff0050' },
              { name:'Twitter/X', icon:'🐦', color:'#1da1f2' },
              { name:'YouTube', icon:'▶️', color:'#ff0000' },
            ].map(p=>(
              <span key={p.name} style={{ background:`${p.color}12`, border:`1px solid ${p.color}30`, color:p.color, borderRadius:'20px', padding:'4px 10px', fontSize:'11px', fontWeight:'600' }}>
                {p.icon} {p.name}
              </span>
            ))}
          </div>

          <div style={{ display:'flex', gap:'10px' }}>
            <input
              value={url}
              onChange={e=>setUrl(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&analyze()}
              placeholder="https://www.facebook.com/share/p/... o https://www.instagram.com/p/..."
              style={{ flex:1, padding:'12px 14px', fontSize:'14px', borderRadius:'10px', border:'2px solid var(--border2)', background:'var(--bg3)', color:'var(--text)', outline:'none', transition:'border-color .2s' }}
              onFocus={e=>e.target.style.borderColor='#3b82f6'}
              onBlur={e=>e.target.style.borderColor='var(--border2)'}
            />
            <button onClick={analyze} disabled={loading || !url.trim()} style={{ background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', color:'#fff', border:'none', borderRadius:'10px', padding:'12px 24px', fontSize:'14px', fontWeight:'700', cursor:loading||!url.trim()?'not-allowed':'pointer', opacity:!url.trim()?0.5:1, whiteSpace:'nowrap', minWidth:'120px' }}>
              {loading ? '⏳ Analizando...' : '🔬 Analizar'}
            </button>
          </div>

          {platform && url && (
            <div style={{ marginTop:'10px', fontSize:'12px', color:'var(--text3)' }}>
              Plataforma detectada: <span style={{ color:platform.color, fontWeight:'600' }}>{platform.icon} {platform.name}</span>
            </div>
          )}

          {error && (
            <div style={{ marginTop:'12px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'8px', padding:'10px 14px', fontSize:'13px', color:'#f87171' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'48px', textAlign:'center' }}>
            <div style={{ fontSize:'40px', marginBottom:'16px', animation:'spin 2s linear infinite', display:'inline-block' }}>🔬</div>
            <div style={{ fontSize:'16px', fontWeight:'700', marginBottom:'8px' }}>Analizando publicación...</div>
            <div style={{ fontSize:'13px', color:'var(--text3)' }}>Extrayendo métricas, comentarios y sentimiento. Puede tardar hasta 30 segundos.</div>
          </div>
        )}

        {/* RESULTS */}
        {result && !loading && (
          <>
            {/* POST INFO */}
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
              <div style={{ display:'flex', gap:'14px', alignItems:'flex-start' }}>
                {result.platform && (
                  <div style={{ width:'44px', height:'44px', borderRadius:'10px', background:`${detectPlatform(url)?.color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0 }}>
                    {detectPlatform(url)?.icon}
                  </div>
                )}
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'6px', flexWrap:'wrap' }}>
                    <span style={{ fontSize:'13px', fontWeight:'700', color:'var(--text)' }}>{result.author || result.pageName || 'Publicación'}</span>
                    {result.platform && <Badge text={result.platform} color={detectPlatform(url)?.color||'#64748b'}/>}
                    {result.publishedAt && <span style={{ fontSize:'12px', color:'var(--text3)' }}>{new Date(result.publishedAt).toLocaleDateString('es-AR')}</span>}
                  </div>
                  {result.postText && (
                    <p style={{ fontSize:'14px', color:'var(--text2)', lineHeight:'1.6', margin:'0 0 10px' }}>{result.postText.slice(0, 400)}{result.postText.length > 400 ? '...' : ''}</p>
                  )}
                  <a href={url} target="_blank" rel="noreferrer" style={{ fontSize:'12px', color:'#60a5fa', textDecoration:'none', fontWeight:'600' }}>🔗 Ver publicación original →</a>
                </div>
              </div>
            </div>

            {/* MÉTRICAS PRINCIPALES */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px' }}>
              {[
                { label:'Visualizaciones', value: result.views || result.videoViews || '—', icon:'👁️', color:'#3b82f6' },
                { label:'Likes / Reacciones', value: result.likes || '—', icon:'❤️', color:'#ef4444' },
                { label:'Comentarios', value: result.commentsCount || result.comments?.length || '—', icon:'💬', color:'#f59e0b' },
                { label:'Compartidos', value: result.shares || '—', icon:'🔄', color:'#10b981' },
              ].map((m,i)=>(
                <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', textAlign:'center', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:`linear-gradient(90deg,${m.color},${m.color}66)` }}/>
                  <div style={{ fontSize:'24px', marginBottom:'6px' }}>{m.icon}</div>
                  <div style={{ fontSize:'26px', fontWeight:'900', color:m.color, letterSpacing:'-1px' }}>
                    {typeof m.value === 'number' ? m.value.toLocaleString('es-AR') : m.value}
                  </div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'4px', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.5px' }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* ENGAGEMENT SCORE */}
            {result.engagementRate !== undefined && (
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
                  <div style={{ fontSize:'14px', fontWeight:'700' }}>⚡ Engagement Rate</div>
                  <span style={{ fontSize:'22px', fontWeight:'900', color: result.engagementRate > 5 ? '#10b981' : result.engagementRate > 2 ? '#f59e0b' : '#ef4444' }}>
                    {result.engagementRate.toFixed(2)}%
                  </span>
                </div>
                <div style={{ height:'8px', borderRadius:'4px', background:'var(--border)', overflow:'hidden' }}>
                  <div style={{ width:`${Math.min(result.engagementRate*10,100)}%`, height:'100%', borderRadius:'4px', background:`linear-gradient(90deg,${result.engagementRate>5?'#10b981':result.engagementRate>2?'#f59e0b':'#ef4444'},#3b82f6)` }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'var(--text3)', marginTop:'6px' }}>
                  <span>0% — Sin impacto</span>
                  <span style={{ color: result.engagementRate > 5?'#10b981':result.engagementRate>2?'#f59e0b':'#ef4444', fontWeight:'600' }}>
                    {result.engagementRate > 5 ? '🔥 Viral' : result.engagementRate > 2 ? '📈 Bueno' : '📉 Bajo'}
                  </span>
                  <span>10%+ — Viral</span>
                </div>
              </div>
            )}

            {/* ANÁLISIS DE SENTIMIENTO */}
            {result.overallSentiment && (
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'16px' }}>🧠 Análisis de sentimiento del post</div>
                <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'20px', alignItems:'center' }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'48px', marginBottom:'8px' }}>{SENT_ICONS[result.overallSentiment]}</div>
                    <div style={{ fontSize:'15px', fontWeight:'800', color:SENT_COLORS[result.overallSentiment] }}>{SENT_LABEL[result.overallSentiment]}</div>
                    {result.sentimentScore !== undefined && (
                      <div style={{ fontSize:'12px', color:'var(--text3)', marginTop:'4px' }}>Score: {(result.sentimentScore*100).toFixed(0)}%</div>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize:'13px', color:'var(--text2)', lineHeight:'1.7', margin:0 }}>{result.sentimentAnalysis || 'El contenido del post fue analizado con inteligencia artificial.'}</p>
                    {result.keyTopics?.length > 0 && (
                      <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'12px' }}>
                        {result.keyTopics.map((t,i)=>(
                          <span key={i} style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.25)', color:'#60a5fa', borderRadius:'20px', padding:'3px 10px', fontSize:'11px', fontWeight:'600' }}>#{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SENTIMIENTO COMENTARIOS + PALABRAS */}
            {result.comments?.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>

                {/* Donut sentimiento */}
                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                  <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>💬 Sentimiento en comentarios</div>
                  {sentimentData.length > 0 ? (
                    <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                      <ResponsiveContainer width={130} height={130}>
                        <PieChart>
                          <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                            {sentimentData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex:1 }}>
                        {sentimentData.map((s,i)=>{
                          const total = sentimentData.reduce((a,b)=>a+b.value,0)||1;
                          return (
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px', alignItems:'center' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:s.color }}/>
                                <span style={{ fontSize:'12px', color:'var(--text2)' }}>{s.name}</span>
                              </div>
                              <div>
                                <span style={{ fontSize:'14px', fontWeight:'700', color:s.color }}>{Math.round((s.value/total)*100)}%</span>
                                <span style={{ fontSize:'11px', color:'var(--text3)', marginLeft:'5px' }}>({s.value})</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : <p style={{ color:'var(--text3)', fontSize:'13px' }}>Sin datos de comentarios</p>}
                </div>

                {/* Top palabras */}
                {wordData.length > 0 && (
                  <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                    <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>🔤 Palabras más usadas</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={wordData} layout="vertical" margin={{ left:0, right:10 }}>
                        <XAxis type="number" tick={{ fontSize:10, fill:'#64748b' }}/>
                        <YAxis type="category" dataKey="word" tick={{ fontSize:11, fill:'#94a3b8' }} width={80}/>
                        <Tooltip contentStyle={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'8px', fontSize:'12px' }}/>
                        <Bar dataKey="count" fill="#3b82f6" radius={[0,4,4,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* RESUMEN EJECUTIVO */}
            <div style={{ background:'linear-gradient(135deg,rgba(59,130,246,0.08),rgba(139,92,246,0.05))', border:'1px solid rgba(59,130,246,0.2)', borderRadius:'14px', padding:'20px' }}>
              <div style={{ fontSize:'14px', fontWeight:'700', marginBottom:'14px' }}>📋 Resumen ejecutivo</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'14px' }}>
                {[
                  { label:'Alcance estimado', value: result.estimatedReach ? result.estimatedReach.toLocaleString('es-AR') : '—', desc:'personas impactadas' },
                  { label:'Sentimiento general', value: SENT_ICONS[result.overallSentiment] + ' ' + (SENT_LABEL[result.overallSentiment]||'—'), desc:'del contenido' },
                  { label:'Nivel de impacto', value: result.impactLevel || '—', desc:'en la conversación pública' },
                ].map((s,i)=>(
                  <div key={i} style={{ background:'rgba(255,255,255,0.05)', borderRadius:'10px', padding:'14px', textAlign:'center' }}>
                    <div style={{ fontSize:'20px', fontWeight:'900', color:'var(--text)', marginBottom:'4px' }}>{s.value}</div>
                    <div style={{ fontSize:'11px', fontWeight:'700', color:'var(--text2)', marginBottom:'2px' }}>{s.label}</div>
                    <div style={{ fontSize:'10px', color:'var(--text3)' }}>{s.desc}</div>
                  </div>
                ))}
              </div>
              {result.executiveSummary && (
                <p style={{ fontSize:'13px', color:'var(--text2)', lineHeight:'1.7', margin:0, padding:'12px', background:'rgba(0,0,0,0.2)', borderRadius:'8px' }}>
                  {result.executiveSummary}
                </p>
              )}
            </div>

            {/* COMENTARIOS */}
            {result.comments?.length > 0 && (
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px', padding:'20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px', flexWrap:'wrap', gap:'10px' }}>
                  <div style={{ fontSize:'14px', fontWeight:'700' }}>
                    💬 Comentarios analizados
                    <span style={{ fontSize:'12px', fontWeight:'400', color:'var(--text3)', marginLeft:'8px' }}>{result.comments.length} comentarios</span>
                  </div>
                  <div style={{ display:'flex', gap:'6px' }}>
                    {['ALL','POSITIVE','NEGATIVE','NEUTRAL'].map(f=>(
                      <button key={f} onClick={()=>setCommentFilter(f)} style={{ padding:'5px 10px', borderRadius:'20px', border:'1px solid var(--border)', fontSize:'11px', fontWeight:'600', cursor:'pointer',
                        background: commentFilter===f ? (SENT_COLORS[f]||'var(--accent)') : 'var(--bg3)',
                        color: commentFilter===f ? '#fff' : 'var(--text2)' }}>
                        {f==='ALL'?'Todos':`${SENT_ICONS[f]} ${SENT_LABEL[f]}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ maxHeight:'500px', overflowY:'auto', paddingRight:'4px' }}>
                  {filteredComments.length === 0 ? (
                    <p style={{ textAlign:'center', color:'var(--text3)', padding:'20px', fontSize:'13px' }}>Sin comentarios con ese filtro</p>
                  ) : (
                    filteredComments.map((c,i)=><CommentCard key={i} comment={c} index={i}/>)
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(100,116,139,0.3); border-radius:3px; }
      `}</style>
    </div>
  );
}
