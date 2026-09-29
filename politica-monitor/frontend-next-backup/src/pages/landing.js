// landing.js — PoliticaMonitor Landing Page
import { useState } from 'react';
import { useRouter } from 'next/router';

const FEATURES = [
  { icon:'🌐', title:'Cobertura web total', desc:'Rastrea sitios de noticias locales, portales digitales y cualquier web pública de tu provincia. Sin límite de fuentes.' },
  { icon:'📘', title:'Facebook completo', desc:'Monitorea páginas de medios locales, grupos públicos y cualquier perfil que mencione al candidato en tu zona.' },
  { icon:'📸', title:'Instagram en tiempo real', desc:'Sigue hashtags locales, perfiles de influencers y detecta posts virales de tu región al instante.' },
  { icon:'🐦', title:'Twitter/X político', desc:'Capturá tweets, debates y tendencias de tu provincia antes que el rival se entere.' },
  { icon:'🧠', title:'IA de sentimiento político', desc:'Gemini AI analiza cada mención entendiendo el contexto político argentino, sarcasmo y jerga local.' },
  { icon:'📍', title:'Filtro geográfico exacto', desc:'Buscá en Tierra del Fuego, Córdoba, o cualquier provincia. Solo ves lo de tu zona, nunca ruido de otras regiones.' },
  { icon:'⚡', title:'Alertas de crisis instantáneas', desc:'Recibí alertas por WhatsApp y email cuando detecta picos de negatividad en las primeras horas.' },
  { icon:'📊', title:'Reportes ejecutivos', desc:'Informes en PDF, CSV y Excel listos para reuniones de campaña con datos reales y visualizaciones.' },
  { icon:'👥', title:'Equipo con roles', desc:'Admin, Analista y Monitor. Demos de 30 min para prospectos. Permisos granulares por usuario.' },
];

const PLANS = [
  {
    name:'Básico', price:'USD 500', period:'/mes', color:'#64748b', highlight:false, tag:null,
    desc:'Para candidatos locales que arrancan su monitoreo digital',
    features:['1 campaña activa','Hasta 5 palabras clave','1 provincia / ciudad','Web y Google News','Análisis de sentimiento IA','Feed en tiempo real','Alertas por email','Reportes CSV y TXT','2 usuarios (Admin + Monitor)'],
    missing:['Facebook / Instagram','Alertas WhatsApp','API access'],
  },
  {
    name:'Campaña', price:'USD 1.500', period:'/mes', color:'#3b82f6', highlight:true, tag:'MÁS ELEGIDO',
    desc:'Para campañas provinciales y municipales activas con equipos',
    features:['Hasta 3 campañas activas','Hasta 20 palabras clave','Todas las provincias','Web + Google News + Noticias','Facebook páginas y grupos públicos','Instagram perfiles y hashtags','Twitter/X monitoreo','Análisis IA con Gemini','Alertas email + WhatsApp','Reportes CSV, TXT, JSON, PDF','10 usuarios con roles','Demos de 30 min ilimitadas'],
    missing:[],
  },
  {
    name:'Guerra Electoral', price:'USD 4.000', period:'/mes', color:'#8b5cf6', highlight:false, tag:'MÁXIMA POTENCIA',
    desc:'Para campañas provinciales, nacionales y equipos grandes',
    features:['Campañas ilimitadas','Keywords ilimitadas','Todo el país simultáneo','Todas las fuentes incluidas','Facebook + Instagram + Twitter + YouTube','IA avanzada con análisis profundo','Sala de crisis en tiempo real','Alertas multicanal 24/7','Usuarios ilimitados','API access para integraciones','Analista dedicado 8hs/día','Soporte prioritario 24/7'],
    missing:[],
  },
];

export default function Landing() {
  const router = useRouter();
  const [form, setForm] = useState({ nombre:'', email:'', cargo:'', provincia:'', mensaje:'' });
  const [sent, setSent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", background:'#040911', color:'#f1f5f9', overflowX:'hidden' }}>

      {/* NAV */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, background:'rgba(4,9,17,0.9)', backdropFilter:'blur(16px)', borderBottom:'1px solid rgba(59,130,246,0.1)', padding:'0 6%' }}>
        <div style={{ maxWidth:'1200px', margin:'0 auto', display:'flex', alignItems:'center', height:'64px', gap:'16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flex:1 }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'9px', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'17px' }}>📡</div>
            <span style={{ fontSize:'19px', fontWeight:'900', letterSpacing:'-0.5px' }}>Politica<span style={{ color:'#3b82f6' }}>Monitor</span></span>
          </div>
          <div className="nav-links" style={{ display:'flex', gap:'24px', alignItems:'center' }}>
            {['#funcionalidades','#precios','#contacto'].map((href,i)=>['Funcionalidades','Precios','Contacto'].map((l,j)=>i===j&&(
              <a key={href} href={href} style={{ color:'#94a3b8', fontSize:'14px', fontWeight:'500', textDecoration:'none' }}
                onMouseEnter={e=>e.target.style.color='#f1f5f9'} onMouseLeave={e=>e.target.style.color='#94a3b8'}>{l}</a>
            )))}
            <button onClick={()=>router.push('/login')} style={{ background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 20px', fontSize:'13px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>Ingresar →</button>
          </div>
          <button className="nav-burger" onClick={()=>setMobileMenuOpen(o=>!o)} aria-label="Menú" style={{ display:'none', background:'none', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', color:'#f1f5f9', fontSize:'20px', width:'40px', height:'40px', cursor:'pointer', alignItems:'center', justifyContent:'center' }}>
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="nav-mobile-panel" style={{ borderTop:'1px solid rgba(59,130,246,0.1)', padding:'18px 6% 24px', display:'flex', flexDirection:'column', gap:'16px', background:'rgba(4,9,17,0.98)' }}>
            {['#funcionalidades','#precios','#contacto'].map((href,i)=>['Funcionalidades','Precios','Contacto'].map((l,j)=>i===j&&(
              <a key={href} href={href} onClick={()=>setMobileMenuOpen(false)} style={{ color:'#cbd5e1', fontSize:'15px', fontWeight:'600', textDecoration:'none' }}>{l}</a>
            )))}
            <button onClick={()=>router.push('/login')} style={{ background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', color:'#fff', border:'none', borderRadius:'8px', padding:'12px 20px', fontSize:'14px', fontWeight:'700', cursor:'pointer', width:'100%' }}>Ingresar →</button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'120px 6% 80px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'15%', left:'50%', transform:'translateX(-50%)', width:'900px', height:'900px', borderRadius:'50%', background:'radial-gradient(circle,rgba(59,130,246,0.1) 0%,transparent 65%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:'10%', right:'10%', width:'500px', height:'500px', borderRadius:'50%', background:'radial-gradient(circle,rgba(139,92,246,0.06) 0%,transparent 70%)', pointerEvents:'none' }}/>

        <div style={{ maxWidth:'860px', position:'relative', zIndex:1 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'20px', padding:'6px 16px', marginBottom:'32px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#ef4444', animation:'pulse 1s ease-in-out infinite' }}/>
            <span style={{ fontSize:'12px', fontWeight:'700', color:'#f87171', letterSpacing:'1px', textTransform:'uppercase' }}>Monitoreo político en tiempo real · Argentina</span>
          </div>

          <h1 style={{ fontSize:'clamp(40px,6.5vw,78px)', fontWeight:'900', lineHeight:'1.02', marginBottom:'24px', letterSpacing:'-3px' }}>
            Cada mención a tu<br/>candidato,<br/>
            <span style={{ background:'linear-gradient(135deg,#3b82f6 30%,#8b5cf6)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              antes que nadie
            </span>
          </h1>

          <p style={{ fontSize:'clamp(17px,2vw,22px)', color:'#94a3b8', maxWidth:'640px', margin:'0 auto 44px', lineHeight:'1.7' }}>
            Inteligencia política para campañas argentinas. Monitorea redes sociales, medios y sitios web de tu provincia en tiempo real con análisis de sentimiento por IA.
          </p>

          <div style={{ display:'flex', gap:'14px', justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={()=>document.getElementById('precios')?.scrollIntoView({behavior:'smooth'})} style={{ background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', color:'#fff', border:'none', borderRadius:'12px', padding:'16px 36px', fontSize:'16px', fontWeight:'700', cursor:'pointer', boxShadow:'0 0 50px rgba(59,130,246,0.35)' }}>
              Ver planes y precios
            </button>
            <button onClick={()=>router.push('/login')} style={{ background:'rgba(255,255,255,0.06)', color:'#f1f5f9', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'12px', padding:'16px 36px', fontSize:'16px', fontWeight:'600', cursor:'pointer' }}>
              Demo gratuita →
            </button>
          </div>

          {/* Stats */}
          <div style={{ display:'flex', gap:'48px', justifyContent:'center', marginTop:'72px', flexWrap:'wrap' }}>
            {[['24/7','Monitoreo continuo'],['15min','Actualización'],['5+','Fuentes simultáneas'],['IA','Análisis automático']].map(([n,l])=>(
              <div key={n} style={{ textAlign:'center' }}>
                <div style={{ fontSize:'30px', fontWeight:'900', color:'#3b82f6', letterSpacing:'-1px' }}>{n}</div>
                <div style={{ fontSize:'12px', color:'#475569', marginTop:'4px', fontWeight:'500' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEMA */}
      <section style={{ padding:'80px 6%', background:'rgba(255,255,255,0.015)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
        <div className="grid-problema" style={{ maxWidth:'1100px', margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'64px', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:'11px', fontWeight:'700', color:'#ef4444', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'16px' }}>El problema real</div>
            <h2 style={{ fontSize:'clamp(28px,3vw,44px)', fontWeight:'900', lineHeight:'1.15', marginBottom:'20px', letterSpacing:'-1.5px' }}>
              Las crisis en redes explotan en minutos. Tu equipo se entera en horas.
            </h2>
            <p style={{ color:'#94a3b8', fontSize:'16px', lineHeight:'1.8', marginBottom:'28px' }}>
              Cuando el rival publica algo negativo sobre tu candidato a las 10pm, a las 10:05pm ya tiene 500 likes. A las 10:15pm lo están compartiendo grupos de whatsapp. Tu equipo lo ve al día siguiente.
            </p>
            {['No sabés lo que dicen en los grupos de Facebook de tu municipio','Te enterás de los ataques cuando ya son virales','No tenés datos duros para responder con argumentos','Perdés horas buscando menciones manualmente'].map((p,i)=>(
              <div key={i} style={{ display:'flex', gap:'12px', alignItems:'flex-start', marginBottom:'12px' }}>
                <span style={{ color:'#ef4444', flexShrink:0, marginTop:'2px' }}>✗</span>
                <span style={{ color:'#94a3b8', fontSize:'15px', lineHeight:'1.5' }}>{p}</span>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            <div style={{ fontSize:'11px', fontWeight:'700', color:'#10b981', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'4px' }}>Con PoliticaMonitor</div>
            {[
              { icon:'📡', color:'#10b981', t:'Sabés en 15 minutos', d:'El sistema rastrea tu provincia automáticamente y te avisa en tiempo real.' },
              { icon:'🔔', color:'#f59e0b', t:'Alertas antes que el rival', d:'WhatsApp y email cuando detecta picos de negatividad o contenido viral.' },
              { icon:'🧠', color:'#8b5cf6', t:'IA analiza el contexto político', d:'Gemini AI entiende sarcasmo, ironía y jerga política argentina.' },
              { icon:'📊', color:'#3b82f6', t:'Datos para responder', d:'Reportes con evidencia real para reuniones de equipo y estrategia.' },
            ].map(s=>(
              <div key={s.t} style={{ display:'flex', gap:'14px', background:`${s.color}08`, border:`1px solid ${s.color}20`, borderRadius:'12px', padding:'14px 16px' }}>
                <span style={{ fontSize:'22px' }}>{s.icon}</span>
                <div>
                  <div style={{ fontWeight:'700', fontSize:'14px', color:s.color, marginBottom:'3px' }}>{s.t}</div>
                  <div style={{ color:'#64748b', fontSize:'13px' }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="funcionalidades" style={{ padding:'100px 6%' }}>
        <div style={{ maxWidth:'1100px', margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:'64px' }}>
            <div style={{ fontSize:'11px', fontWeight:'700', color:'#3b82f6', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'12px' }}>Funcionalidades</div>
            <h2 style={{ fontSize:'clamp(28px,3vw,46px)', fontWeight:'900', letterSpacing:'-2px', marginBottom:'16px' }}>Todo lo que necesita tu campaña</h2>
            <p style={{ color:'#64748b', fontSize:'16px', maxWidth:'540px', margin:'0 auto' }}>Diseñado específicamente para campañas políticas argentinas, con foco en el interior del país.</p>
          </div>
          <div className="grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
            {FEATURES.map((f,i)=>(
              <div key={i} style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'14px', padding:'22px', cursor:'pointer', transition:'all .2s' }}
                onMouseEnter={e=>{ e.currentTarget.style.background='rgba(59,130,246,0.06)'; e.currentTarget.style.borderColor='rgba(59,130,246,0.25)'; e.currentTarget.style.transform='translateY(-3px)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'; e.currentTarget.style.transform='translateY(0)'; }}>
                <div style={{ fontSize:'28px', marginBottom:'12px' }}>{f.icon}</div>
                <div style={{ fontWeight:'700', fontSize:'14px', marginBottom:'8px', color:'#e2e8f0' }}>{f.title}</div>
                <div style={{ color:'#64748b', fontSize:'13px', lineHeight:'1.6' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section style={{ padding:'80px 6%', background:'rgba(255,255,255,0.015)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth:'900px', margin:'0 auto', textAlign:'center' }}>
          <h2 style={{ fontSize:'clamp(26px,3vw,42px)', fontWeight:'900', letterSpacing:'-1.5px', marginBottom:'56px' }}>En 3 pasos empezás a monitorear</h2>
          <div className="grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'24px' }}>
            {[
              { n:'1', icon:'🎯', t:'Configurás en 5 minutos', d:'Nombre del candidato, provincia, ciudad y palabras clave. Nada más.' },
              { n:'2', icon:'🤖', t:'El sistema trabaja solo', d:'Cada 15 minutos rastrea toda la red de tu zona. Vos no hacés nada.' },
              { n:'3', icon:'🔔', t:'Tomás decisiones con datos', d:'Feed en tiempo real, alertas y reportes para el equipo de campaña.' },
            ].map((s,i)=>(
              <div key={i}>
                <div style={{ width:'60px', height:'60px', borderRadius:'50%', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px', margin:'0 auto 16px', boxShadow:'0 0 30px rgba(59,130,246,0.3)' }}>{s.icon}</div>
                <div style={{ fontSize:'11px', color:'#3b82f6', fontWeight:'700', letterSpacing:'1px', marginBottom:'8px' }}>PASO {s.n}</div>
                <div style={{ fontWeight:'800', fontSize:'16px', marginBottom:'10px' }}>{s.t}</div>
                <div style={{ color:'#64748b', fontSize:'14px', lineHeight:'1.6' }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRECIOS */}
      <section id="precios" style={{ padding:'100px 6%' }}>
        <div style={{ maxWidth:'1100px', margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:'64px' }}>
            <div style={{ fontSize:'11px', fontWeight:'700', color:'#3b82f6', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'12px' }}>Planes</div>
            <h2 style={{ fontSize:'clamp(28px,3vw,46px)', fontWeight:'900', letterSpacing:'-2px', marginBottom:'12px' }}>Sin contratos anuales</h2>
            <p style={{ color:'#64748b', fontSize:'16px' }}>Cancelás cuando querés. Precio fijo en dólares.</p>
          </div>

          <div className="grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'20px', alignItems:'start' }}>
            {PLANS.map((plan,i)=>(
              <div key={i} className="plan-card" style={{ background: plan.highlight ? 'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(139,92,246,0.06))' : 'rgba(255,255,255,0.02)', border:`1px solid ${plan.highlight?plan.color+'50':'rgba(255,255,255,0.08)'}`, borderRadius:'16px', padding:'30px', position:'relative', boxShadow: plan.highlight?`0 0 60px ${plan.color}18`:'' ,transform: plan.highlight?'scale(1.03)':'' }}>
                {plan.tag && (
                  <div style={{ position:'absolute', top:'-13px', left:'50%', transform:'translateX(-50%)', background:`linear-gradient(135deg,${plan.color},#8b5cf6)`, color:'#fff', fontSize:'10px', fontWeight:'800', padding:'4px 14px', borderRadius:'20px', letterSpacing:'1.5px', whiteSpace:'nowrap' }}>{plan.tag}</div>
                )}
                <div style={{ fontSize:'11px', fontWeight:'700', color:plan.color, marginBottom:'8px', letterSpacing:'1px', textTransform:'uppercase' }}>{plan.name}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:'4px', marginBottom:'8px' }}>
                  <span style={{ fontSize:'40px', fontWeight:'900', letterSpacing:'-2px' }}>{plan.price}</span>
                  <span style={{ fontSize:'13px', color:'#475569' }}>{plan.period}</span>
                </div>
                <div style={{ fontSize:'13px', color:'#64748b', marginBottom:'24px', lineHeight:'1.5' }}>{plan.desc}</div>
                <button onClick={()=>document.getElementById('contacto')?.scrollIntoView({behavior:'smooth'})} style={{ width:'100%', padding:'13px', borderRadius:'10px', border:'none', background: plan.highlight?`linear-gradient(135deg,${plan.color},#8b5cf6)`:`${plan.color}15`, color: plan.highlight?'#fff':plan.color, fontSize:'14px', fontWeight:'700', cursor:'pointer', marginBottom:'24px', boxShadow: plan.highlight?`0 0 25px ${plan.color}40`:'' }}>
                  Contratar {plan.name}
                </button>
                {plan.features.map((f,j)=>(
                  <div key={j} style={{ display:'flex', gap:'10px', alignItems:'flex-start', marginBottom:'9px' }}>
                    <span style={{ color:'#10b981', flexShrink:0, fontSize:'13px', marginTop:'1px' }}>✓</span>
                    <span style={{ fontSize:'13px', color:'#cbd5e1', lineHeight:'1.4' }}>{f}</span>
                  </div>
                ))}
                {plan.missing.map((f,j)=>(
                  <div key={j} style={{ display:'flex', gap:'10px', alignItems:'flex-start', marginBottom:'9px', opacity:0.35 }}>
                    <span style={{ color:'#64748b', flexShrink:0 }}>—</span>
                    <span style={{ fontSize:'13px', color:'#64748b' }}>{f}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ textAlign:'center', marginTop:'36px', padding:'18px', background:'rgba(59,130,246,0.05)', border:'1px solid rgba(59,130,246,0.15)', borderRadius:'12px' }}>
            <p style={{ color:'#94a3b8', fontSize:'14px' }}>💡 <strong style={{ color:'#f1f5f9' }}>¿No sabés cuál elegir?</strong> Te hacemos una demo de 30 minutos con el nombre de tu candidato y tu provincia, gratis y sin compromiso.</p>
          </div>
        </div>
      </section>

      {/* CONTACTO */}
      <section id="contacto" style={{ padding:'100px 6%', background:'rgba(255,255,255,0.015)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth:'680px', margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:'48px' }}>
            <div style={{ fontSize:'11px', fontWeight:'700', color:'#3b82f6', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'12px' }}>Contacto</div>
            <h2 style={{ fontSize:'clamp(28px,3vw,44px)', fontWeight:'900', letterSpacing:'-1.5px', marginBottom:'12px' }}>Pedí tu demo gratuita</h2>
            <p style={{ color:'#64748b', fontSize:'16px' }}>Te mostramos el sistema funcionando con el nombre de tu candidato y tu provincia.</p>
          </div>

          {sent ? (
            <div style={{ textAlign:'center', padding:'48px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:'16px' }}>
              <div style={{ fontSize:'48px', marginBottom:'16px' }}>✅</div>
              <h3 style={{ fontWeight:'700', marginBottom:'8px' }}>¡Mensaje recibido!</h3>
              <p style={{ color:'#94a3b8' }}>Te contactamos en menos de 24 horas para coordinar la demo.</p>
            </div>
          ) : (
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'36px' }}>
              <div className="grid-contacto" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
                {[
                  { key:'nombre', label:'Nombre completo', placeholder:'Juan García', type:'text' },
                  { key:'email', label:'Email', placeholder:'juan@campaña.com', type:'email' },
                  { key:'cargo', label:'Cargo / Rol', placeholder:'Coordinador de campaña', type:'text' },
                ].map(f=>(
                  <div key={f.key} style={f.key==='cargo'?{ gridColumn:'1 / -1' }:{}}>
                    <label style={{ display:'block', fontSize:'11px', color:'#64748b', fontWeight:'700', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{f.label}</label>
                    <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder}
                      style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#f1f5f9', padding:'10px 14px', borderRadius:'8px', fontSize:'14px', outline:'none', boxSizing:'border-box' }}/>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom:'16px' }}>
                <label style={{ display:'block', fontSize:'11px', color:'#64748b', fontWeight:'700', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px' }}>Provincia</label>
                <select value={form.provincia} onChange={e=>setForm(p=>({...p,provincia:e.target.value}))}
                  style={{ width:'100%', background:'#0f1623', border:'1px solid rgba(255,255,255,0.1)', color:form.provincia?'#f1f5f9':'#64748b', padding:'10px 14px', borderRadius:'8px', fontSize:'14px', outline:'none' }}>
                  <option value=''>Seleccioná provincia</option>
                  {['Buenos Aires','Córdoba','Santa Fe','Mendoza','Tucumán','Entre Ríos','Salta','Misiones','Chaco','Corrientes','Santiago del Estero','San Juan','Jujuy','Río Negro','Neuquén','Formosa','La Pampa','Chubut','San Luis','Catamarca','La Rioja','Santa Cruz','Tierra del Fuego'].map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:'20px' }}>
                <label style={{ display:'block', fontSize:'11px', color:'#64748b', fontWeight:'700', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px' }}>¿Qué necesitás monitorear?</label>
                <textarea value={form.mensaje} onChange={e=>setForm(p=>({...p,mensaje:e.target.value}))} placeholder="Contanos sobre tu candidato y el distrito..." rows={3}
                  style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#f1f5f9', padding:'10px 14px', borderRadius:'8px', fontSize:'14px', outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
              </div>
              <button onClick={()=>{ if(!form.nombre||!form.email) return alert('Completá nombre y email'); setSent(true); }}
                style={{ width:'100%', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', color:'#fff', border:'none', borderRadius:'10px', padding:'15px', fontSize:'15px', fontWeight:'700', cursor:'pointer', boxShadow:'0 0 40px rgba(59,130,246,0.25)' }}>
                📡 Solicitar demo gratuita →
              </button>
              <p style={{ textAlign:'center', color:'#334155', fontSize:'12px', marginTop:'12px' }}>Respondemos en menos de 24 horas · Sin compromiso</p>
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding:'32px 6%', borderTop:'1px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.4)' }}>
        <div style={{ maxWidth:'1100px', margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ width:'26px', height:'26px', borderRadius:'7px', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px' }}>📡</div>
            <span style={{ fontWeight:'900', fontSize:'15px' }}>Politica<span style={{ color:'#3b82f6' }}>Monitor</span></span>
          </div>
          <p style={{ color:'#1e293b', fontSize:'13px' }}>© 2026 PoliticaMonitor · Inteligencia política para Argentina</p>
          <button onClick={()=>router.push('/login')} style={{ background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.25)', color:'#60a5fa', borderRadius:'8px', padding:'8px 18px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>Ingresar al sistema →</button>
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        html { scroll-behavior:smooth; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        input::placeholder, textarea::placeholder { color:#334155; }
        select option { background:#0f1623; color:#f1f5f9; }

        @media (max-width: 768px) {
          .nav-links { display:none !important; }
          .nav-burger { display:flex !important; }
        }
        @media (max-width: 760px) {
          .grid-problema { grid-template-columns:1fr !important; gap:36px !important; }
        }
        @media (max-width: 900px) {
          .grid-3 { grid-template-columns:repeat(2,1fr) !important; }
          .plan-card { transform:none !important; }
        }
        @media (max-width: 600px) {
          .grid-3 { grid-template-columns:1fr !important; }
          .grid-contacto { grid-template-columns:1fr !important; }
        }
        @media (max-width: 480px) {
          nav > div:first-child { height:56px; }
        }
      `}</style>
    </div>
  );
}
