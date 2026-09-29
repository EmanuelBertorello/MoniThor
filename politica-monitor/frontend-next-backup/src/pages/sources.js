// src/pages/sources.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { campaignsAPI, sourcesAPI } from '../lib/api';
import toast from 'react-hot-toast';

const TYPE_META = {
  WEBSITE:            { icon: '🌐', label: 'Sitio web',         color: '#0ea5e9', hint: 'Ej: https://diariopolitico.com/seccion/local' },
  RSS_FEED:           { icon: '📡', label: 'Feed RSS/Atom',     color: '#8b5cf6', hint: 'Ej: https://infobae.com/feeds/rss/' },
  FACEBOOK_PAGE:      { icon: '📘', label: 'Página de Facebook', color: '#1877f2', hint: 'Ej: https://facebook.com/paginadelcandidato' },
  TWITTER_PROFILE:    { icon: '🐦', label: 'Perfil Twitter/X',  color: '#1d9bf0', hint: 'Ej: https://twitter.com/candidato', disabled: true },
  YOUTUBE_CHANNEL:    { icon: '▶️', label: 'Canal YouTube',     color: '#ff0000', hint: 'Ej: https://youtube.com/channel/UCxxx', disabled: true },
  REDDIT:             { icon: '🔴', label: 'Subreddit',         color: '#ff4500', hint: 'Ej: https://reddit.com/r/argentina' },
};

const API_REQUIREMENTS = {
  WEBSITE:           null,
  RSS_FEED:          null,
  FACEBOOK_PAGE:     null,
  TWITTER_PROFILE:   'TWITTER_BEARER_TOKEN',
  YOUTUBE_CHANNEL:   'YOUTUBE_API_KEY',
  REDDIT:            null,
};

export default function SourcesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaignId, setActiveCampaignId] = useState('');
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ url: '', name: '', type: 'WEBSITE', notes: '' });
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    campaignsAPI.list().then(r => {
      setCampaigns(r.data.campaigns);
      if (r.data.campaigns.length > 0) setActiveCampaignId(r.data.campaigns[0].id);
    });
  }, [user]);

  useEffect(() => {
    if (!activeCampaignId) return;
    setLoading(true);
    sourcesAPI.list(activeCampaignId)
      .then(r => setSources(r.data.sources))
      .catch(() => toast.error('Error al cargar fuentes'))
      .finally(() => setLoading(false));
  }, [activeCampaignId]);

  // Auto-detect type from URL
  function handleUrlChange(url) {
    setForm(p => {
      const lower = url.toLowerCase();
      let type = p.type;
      if (lower.includes('facebook.com')) type = 'FACEBOOK_PAGE';
      else if (lower.includes('twitter.com') || lower.includes('x.com')) type = 'TWITTER_PROFILE';
      else if (lower.includes('youtube.com')) type = 'YOUTUBE_CHANNEL';
      else if (lower.includes('reddit.com')) type = 'REDDIT';
      else if (lower.endsWith('.xml') || lower.includes('/feed') || lower.includes('/rss')) type = 'RSS_FEED';
      return { ...p, url, type };
    });
  }

  async function addSource() {
    if (!form.url.trim()) return toast.error('Ingresá una URL');
    try { new URL(form.url); } catch { return toast.error('URL inválida'); }
    if (TYPE_META[form.type]?.disabled) {
      return toast.error(`${TYPE_META[form.type].label} no disponible todavía — scraper no implementado`);
    }

    try {
      const res = await sourcesAPI.create({ ...form, campaignId: activeCampaignId });
      setSources(p => [res.data.source, ...p]);
      setForm({ url: '', name: '', type: 'WEBSITE', notes: '' });
      setShowAdd(false);
      toast.success('Fuente agregada ✅');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al agregar fuente');
    }
  }

  async function toggleSource(src) {
    const res = await sourcesAPI.update(src.id, { isActive: !src.isActive });
    setSources(p => p.map(s => s.id === src.id ? res.data.source : s));
  }

  async function deleteSource(id) {
    if (!confirm('¿Eliminar esta fuente?')) return;
    await sourcesAPI.delete(id);
    setSources(p => p.filter(s => s.id !== id));
    toast.success('Fuente eliminada');
  }

  async function testSource(src) {
    setTesting(p => ({ ...p, [src.id]: true }));
    setTestResults(p => ({ ...p, [src.id]: null }));
    try {
      const res = await sourcesAPI.test(src.id);
      setTestResults(p => ({ ...p, [src.id]: res.data }));
      if (res.data.found > 0) {
        toast.success(`✅ ${res.data.found} menciones encontradas en ${src.name}`);
      } else {
        toast(`😐 Sin menciones en este momento en ${src.name}`, { icon: '🔍' });
      }
    } catch (err) {
      toast.error(`Error al testear: ${err.response?.data?.error || err.message}`);
    } finally {
      setTesting(p => ({ ...p, [src.id]: false }));
    }
  }

  if (authLoading) return null;

  const selectedTypeMeta = TYPE_META[form.type];
  const reqKey = API_REQUIREMENTS[form.type];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        padding: '14px 24px', display: 'flex', alignItems: 'center', gap: '16px',
        position: 'sticky', top: 0, zIndex: 40
      }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '20px' }}>←</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🌐</span>
          <span style={{ fontSize: '17px', fontWeight: '700' }}>Fuentes personalizadas</span>
        </div>
        <select
          value={activeCampaignId}
          onChange={e => setActiveCampaignId(e.target.value)}
          style={{ marginLeft: 'auto', width: 'auto', padding: '7px 12px', fontSize: '13px' }}
        >
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Agregar fuente</button>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Intro card */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f20, #8b5cf620)',
          border: '1px solid var(--border2)', borderRadius: '12px',
          padding: '20px 24px', marginBottom: '28px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>
            📍 ¿Qué páginas querés monitorear?
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.7', maxWidth: '680px' }}>
            Agregá las URLs exactas que el sistema debe rastrear automáticamente — sitios de noticias locales, perfiles de candidatos en Twitter, feeds RSS de medios, subreddits, etc. El sistema las revisará cada 15 minutos buscando menciones de tus keywords.
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
            {Object.entries(TYPE_META).map(([type, meta]) => (
              <span key={type} style={{
                background: meta.disabled ? 'var(--bg3)' : `${meta.color}15`,
                border: `1px solid ${meta.disabled ? 'var(--border)' : `${meta.color}40`}`,
                color: meta.disabled ? 'var(--text3)' : meta.color,
                padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600'
              }}>
                {meta.icon} {meta.label}{meta.disabled ? ' (no disponible)' : ''}
              </span>
            ))}
          </div>
        </div>

        {/* ADD FORM */}
        {showAdd && (
          <div className="card" style={{ marginBottom: '24px', borderColor: 'var(--border2)' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '18px' }}>➕ Nueva fuente</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label>URL de la página</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={e => handleUrlChange(e.target.value)}
                  placeholder="https://..."
                  style={{ fontSize: '14px' }}
                />
                {selectedTypeMeta && (
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                    {selectedTypeMeta.hint}
                  </p>
                )}
              </div>
              <div style={{ width: '160px' }}>
                <label>Tipo detectado</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {Object.entries(TYPE_META).map(([k, v]) => (
                    <option key={k} value={k} disabled={v.disabled}>{v.icon} {v.label}{v.disabled ? ' (no disponible)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label>Nombre (opcional)</label>
                <input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Diario Local Norte"
                />
              </div>
              <div>
                <label>Notas internas</label>
                <input
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Ej: Medio opositor, alta influencia regional"
                />
              </div>
            </div>

            {/* Disabled type warning */}
            {selectedTypeMeta?.disabled ? (
              <div style={{
                background: '#ef444412', border: '1px solid #ef444440',
                borderRadius: '8px', padding: '10px 14px', marginBottom: '12px',
                fontSize: '12px', color: '#f87171'
              }}>
                🚫 {selectedTypeMeta.label} no disponible — no hay scraper implementado para este tipo de fuente.
              </div>
            ) : reqKey && (
              <div style={{
                background: '#f59e0b12', border: '1px solid #f59e0b40',
                borderRadius: '8px', padding: '10px 14px', marginBottom: '12px',
                fontSize: '12px', color: '#fbbf24'
              }}>
                ⚠️ Este tipo de fuente requiere <code style={{ background: '#f59e0b20', padding: '1px 5px', borderRadius: '4px' }}>{reqKey}</code> configurado en <code>backend/.env</code> para funcionar. Sin él, será omitida durante el scraping.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setForm({ url: '', name: '', type: 'WEBSITE', notes: '' }); }}>Cancelar</button>
              <button className="btn btn-primary" disabled={selectedTypeMeta?.disabled} onClick={addSource}>✅ Agregar fuente</button>
            </div>
          </div>
        )}

        {/* SOURCES LIST */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text3)' }}>⏳ Cargando...</div>
        ) : sources.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--text3)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌐</div>
            <p style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>Sin fuentes personalizadas todavía</p>
            <p style={{ fontSize: '13px', maxWidth: '400px', margin: '0 auto' }}>
              Agregá las páginas específicas que querés monitorear. El sistema las revisará automáticamente cada 15 minutos.
            </p>
            <button className="btn btn-primary" style={{ marginTop: '20px' }} onClick={() => setShowAdd(true)}>
              + Agregar primera fuente
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '4px' }}>
              {sources.length} fuente{sources.length !== 1 ? 's' : ''} configurada{sources.length !== 1 ? 's' : ''}
              · {sources.filter(s => s.isActive).length} activa{sources.filter(s => s.isActive).length !== 1 ? 's' : ''}
            </div>

            {sources.map(src => {
              const meta = TYPE_META[src.type] || TYPE_META.WEBSITE;
              const result = testResults[src.id];

              return (
                <div key={src.id} style={{
                  background: 'var(--bg2)', border: `1px solid ${src.isActive ? 'var(--border)' : 'var(--border)'}`,
                  borderRadius: '10px', padding: '14px 16px',
                  opacity: src.isActive ? 1 : 0.55,
                  transition: 'all 0.2s'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    {/* Type badge */}
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                      background: `${meta.color}20`, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '18px'
                    }}>{meta.icon}</div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '700', fontSize: '14px' }}>{src.name}</span>
                        <span style={{
                          background: `${meta.color}15`, color: meta.color,
                          border: `1px solid ${meta.color}30`,
                          fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px'
                        }}>{meta.label}</span>
                        {!src.isActive && (
                          <span style={{ fontSize: '11px', color: 'var(--text3)', fontStyle: 'italic' }}>Pausada</span>
                        )}
                      </div>

                      <div style={{
                        fontSize: '12px', color: 'var(--accent2)', marginTop: '3px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        <a href={src.url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'inherit', textDecoration: 'none' }}>
                          {src.url}
                        </a>
                      </div>

                      {src.notes && (
                        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '3px' }}>
                          📝 {src.notes}
                        </div>
                      )}

                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                        {src.lastScraped
                          ? `Último scraping: ${new Date(src.lastScraped).toLocaleString('es-AR')}`
                          : 'Sin scraping aún — se ejecutará en el próximo ciclo'}
                      </div>

                      {/* Test preview */}
                      {result && (
                        <div style={{
                          marginTop: '8px', background: result.found > 0 ? '#10b98112' : 'var(--bg3)',
                          border: `1px solid ${result.found > 0 ? '#10b98140' : 'var(--border)'}`,
                          borderRadius: '8px', padding: '10px 12px', fontSize: '12px'
                        }}>
                          <strong style={{ color: result.found > 0 ? '#10b981' : 'var(--text2)' }}>
                            {result.found > 0 ? `✅ ${result.found} menciones encontradas` : '😐 Sin menciones en este momento'}
                          </strong>
                          {result.preview?.map((p, i) => (
                            <div key={i} style={{ marginTop: '6px', color: 'var(--text2)', borderLeft: '2px solid var(--border2)', paddingLeft: '8px' }}>
                              {p.content?.slice(0, 120)}...
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => testSource(src)}
                        disabled={testing[src.id]}
                        style={{
                          background: 'var(--bg3)', border: '1px solid var(--border2)',
                          color: 'var(--text2)', borderRadius: '7px', padding: '7px 12px',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                        }}
                      >
                        {testing[src.id] ? '⏳' : '🔍 Testear'}
                      </button>
                      <button
                        onClick={() => toggleSource(src)}
                        style={{
                          background: src.isActive ? '#ef444412' : '#10b98112',
                          border: `1px solid ${src.isActive ? '#ef444440' : '#10b98140'}`,
                          color: src.isActive ? '#f87171' : '#34d399',
                          borderRadius: '7px', padding: '7px 12px',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                        }}
                      >
                        {src.isActive ? '⏸ Pausar' : '▶️ Activar'}
                      </button>
                      <button
                        onClick={() => deleteSource(src.id)}
                        style={{
                          background: 'none', border: '1px solid var(--border)',
                          color: 'var(--text3)', borderRadius: '7px', padding: '7px 10px',
                          fontSize: '14px', cursor: 'pointer'
                        }}
                      >✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tips */}
        <div style={{ marginTop: '32px', padding: '16px 20px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '10px', color: 'var(--text2)' }}>💡 Consejos para campañas políticas</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              ['📰 Medios locales', 'Agregá los sitios de noticias de tu distrito. Estos definen la narrativa local mejor que los nacionales.'],
              ['📡 Feeds de partidos', 'Los feeds RSS de partidos políticos actualizan comunicados oficiales en tiempo real.'],
              ['🔴 Foros y Reddit', 'Los foros locales en Reddit o similares son termómetros de la opinión ciudadana sin filtros.'],
            ].map(([title, desc]) => (
              <div key={title} style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: '1.6' }}>
                <strong style={{ color: 'var(--text2)' }}>{title}:</strong> {desc}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
