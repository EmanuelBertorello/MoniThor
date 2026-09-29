// src/pages/users.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const ROLES = {
  ADMIN:  { label: 'Administrador', icon: '👑', color: '#f59e0b', desc: 'Acceso total — puede crear campañas, keywords, usuarios y ver todo' },
  ANALYST:{ label: 'Analista',      icon: '📊', color: '#3b82f6', desc: 'Puede crear campañas y keywords, ver datos y bajar reportes' },
  VIEWER: { label: 'Monitor',       icon: '👁️', color: '#10b981', desc: 'Solo puede ver datos y descargar reportes. Sin acceso de escritura' },
};

const PLANS = {
  BASICO:  { label: 'Básico',          color: '#64748b' },
  CAMPANA: { label: 'Campaña',         color: '#3b82f6' },
  GUERRA:  { label: 'Guerra Electoral', color: '#ef4444' },
};

export default function UsersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showNew, setShowNew]       = useState(false);
  const [showDemo, setShowDemo]     = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [createdUser, setCreatedUser] = useState(null); // muestra contraseña temporal

  const [form, setForm]       = useState({ email:'', name:'', role:'VIEWER', plan:'BASICO' });
  const [demoForm, setDemoForm] = useState({ email:'', name:'' });

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (!authLoading && user && user.role !== 'ADMIN') router.push('/dashboard');
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    loadUsers();
  }, [user]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data.users);
    } catch { toast.error('Error al cargar usuarios'); }
    finally { setLoading(false); }
  }

  async function createUser() {
    if (!form.email || !form.name) return toast.error('Completá email y nombre');
    try {
      const res = await api.post('/users', form);
      setUsers(p => [res.data.user, ...p]);
      setCreatedUser({ ...res.data.user, tempPassword: res.data.tempPassword });
      setShowNew(false);
      setForm({ email:'', name:'', role:'VIEWER', plan:'BASICO' });
    } catch (err) { toast.error(err.response?.data?.error || 'Error al crear usuario'); }
  }

  async function createDemo() {
    if (!demoForm.email || !demoForm.name) return toast.error('Completá email y nombre');
    try {
      const res = await api.post('/users/demo', demoForm);
      setUsers(p => [res.data.user, ...p]);
      setCreatedUser({ ...res.data.user, tempPassword: res.data.tempPassword, isDemo: true });
      setShowDemo(false);
      setDemoForm({ email:'', name:'' });
    } catch (err) { toast.error(err.response?.data?.error || 'Error al crear demo'); }
  }

  async function toggleActive(u) {
    const res = await api.put(`/users/${u.id}`, { isActive: !u.isActive });
    setUsers(p => p.map(x => x.id === u.id ? res.data.user : x));
    toast.success(res.data.user.isActive ? 'Usuario activado' : 'Usuario desactivado');
  }

  async function resetPassword(u) {
    if (!confirm(`¿Resetear contraseña de ${u.name}?`)) return;
    const res = await api.put(`/users/${u.id}`, { resetPassword: true });
    setCreatedUser({ ...u, tempPassword: res.data.newPassword, isReset: true });
    toast.success('Contraseña reseteada');
  }

  async function extendDemo(u) {
    const res = await api.put(`/users/${u.id}`, { extendDemo: true });
    setUsers(p => p.map(x => x.id === u.id ? res.data.user : x));
    toast.success('Demo extendida 30 minutos más');
  }

  async function deleteUser(u) {
    if (!confirm(`¿Eliminar a ${u.name}? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/users/${u.id}`);
    setUsers(p => p.filter(x => x.id !== u.id));
    toast.success('Usuario eliminado');
  }

  async function updateRole(u, role) {
    const res = await api.put(`/users/${u.id}`, { role });
    setUsers(p => p.map(x => x.id === u.id ? res.data.user : x));
    toast.success('Rol actualizado');
  }

  async function cleanupDemos() {
    if (!confirm('¿Eliminar todos los usuarios demo expirados?')) return;
    const res = await api.delete('/users/cleanup-demos');
    toast.success(res.data.message);
    loadUsers();
  }

  function isExpired(u) {
    return u.demoExpiresAt && new Date() > new Date(u.demoExpiresAt);
  }

  function timeLeft(u) {
    if (!u.demoExpiresAt) return null;
    const diff = new Date(u.demoExpiresAt) - new Date();
    if (diff <= 0) return 'Expirado';
    const min = Math.floor(diff / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    return `${min}m ${sec}s`;
  }

  if (authLoading || !user) return null;

  const demos = users.filter(u => u.demoExpiresAt);
  const regulars = users.filter(u => !u.demoExpiresAt);

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>

      {/* HEADER */}
      <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', padding:'14px 24px', display:'flex', alignItems:'center', gap:'16px', position:'sticky', top:0, zIndex:40 }}>
        <button onClick={()=>router.push('/dashboard')} style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:'20px' }}>←</button>
        <span style={{ fontSize:'20px' }}>👥</span>
        <span style={{ fontSize:'17px', fontWeight:'700' }}>Gestión de usuarios</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:'8px' }}>
          <button onClick={cleanupDemos} style={{ background:'#64748b20', border:'1px solid #64748b40', color:'#94a3b8', borderRadius:'8px', padding:'7px 14px', fontSize:'12px', cursor:'pointer', fontWeight:'600' }}>
            🧹 Limpiar demos expirados
          </button>
          <button onClick={()=>setShowDemo(true)} style={{ background:'#f59e0b20', border:'1px solid #f59e0b40', color:'#fbbf24', borderRadius:'8px', padding:'7px 14px', fontSize:'12px', cursor:'pointer', fontWeight:'600' }}>
            ⏱ Usuario Demo (30 min)
          </button>
          <button onClick={()=>setShowNew(true)} className="btn btn-primary" style={{ fontSize:'12px' }}>
            + Nuevo usuario
          </button>
        </div>
      </div>

      <div style={{ maxWidth:'1000px', margin:'0 auto', padding:'28px 24px', display:'flex', flexDirection:'column', gap:'24px' }}>

        {/* ROLES INFO */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px' }}>
          {Object.entries(ROLES).map(([key, r]) => (
            <div key={key} style={{ background:'var(--bg2)', border:`1px solid ${r.color}30`, borderRadius:'10px', padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                <span style={{ fontSize:'18px' }}>{r.icon}</span>
                <span style={{ fontWeight:'700', fontSize:'13px', color:r.color }}>{r.label}</span>
              </div>
              <p style={{ fontSize:'12px', color:'var(--text3)', lineHeight:'1.5' }}>{r.desc}</p>
            </div>
          ))}
        </div>

        {/* USUARIOS DEMO */}
        {demos.length > 0 && (
          <div className="card">
            <div style={{ fontSize:'15px', fontWeight:'700', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' }}>
              ⏱ Usuarios demo
              <span style={{ fontSize:'12px', color:'var(--text3)', fontWeight:'400' }}>{demos.length} activos</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {demos.map(u => (
                <DemoUserRow key={u.id} u={u} isExpired={isExpired} timeLeft={timeLeft} onExtend={extendDemo} onDelete={deleteUser} onReset={resetPassword}/>
              ))}
            </div>
          </div>
        )}

        {/* USUARIOS REGULARES */}
        <div className="card">
          <div style={{ fontSize:'15px', fontWeight:'700', marginBottom:'14px' }}>
            👥 Usuarios del sistema
            <span style={{ fontSize:'12px', color:'var(--text3)', fontWeight:'400', marginLeft:'8px' }}>{regulars.length} usuarios</span>
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>⏳ Cargando...</div>
          ) : regulars.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)' }}>
              <div style={{ fontSize:'40px', marginBottom:'12px' }}>👥</div>
              <p>No hay usuarios todavía. Creá el primero arriba.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {regulars.map(u => (
                <UserRow key={u.id} u={u} currentUser={user} onToggle={toggleActive} onDelete={deleteUser} onReset={resetPassword} onRoleChange={updateRole} ROLES={ROLES} PLANS={PLANS}/>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL NUEVO USUARIO */}
      {showNew && (
        <Modal title="👥 Nuevo usuario" onClose={()=>setShowNew(false)}>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div>
              <label>Nombre completo</label>
              <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Ej: María García"/>
            </div>
            <div>
              <label>Email</label>
              <input type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="maria@campaña.com"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div>
                <label>Rol</label>
                <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                  {Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label>Plan</label>
                <select value={form.plan} onChange={e=>setForm(p=>({...p,plan:e.target.value}))}>
                  {Object.entries(PLANS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ background:'var(--bg3)', borderRadius:'8px', padding:'10px 12px', fontSize:'12px', color:'var(--text3)' }}>
              💡 Se generará una contraseña temporal que deberás compartir con el usuario.
            </div>
          </div>
          <ModalActions onCancel={()=>setShowNew(false)} onConfirm={createUser} label="Crear usuario"/>
        </Modal>
      )}

      {/* MODAL USUARIO DEMO */}
      {showDemo && (
        <Modal title="⏱ Usuario Demo — 30 minutos" onClose={()=>setShowDemo(false)}>
          <div style={{ background:'#f59e0b12', border:'1px solid #f59e0b40', borderRadius:'8px', padding:'12px', marginBottom:'16px', fontSize:'13px', color:'#fbbf24' }}>
            Este usuario tendrá acceso de Monitor (solo lectura) durante 30 minutos. Ideal para presentaciones o demos comerciales.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            <div>
              <label>Nombre del prospecto</label>
              <input value={demoForm.name} onChange={e=>setDemoForm(p=>({...p,name:e.target.value}))} placeholder="Ej: Juan Pérez — Campaña X"/>
            </div>
            <div>
              <label>Email</label>
              <input type="email" value={demoForm.email} onChange={e=>setDemoForm(p=>({...p,email:e.target.value}))} placeholder="juan@ejemplo.com"/>
            </div>
          </div>
          <ModalActions onCancel={()=>setShowDemo(false)} onConfirm={createDemo} label="⏱ Crear acceso demo"/>
        </Modal>
      )}

      {/* MODAL CREDENCIALES CREADAS */}
      {createdUser && (
        <Modal title={createdUser.isDemo ? '⏱ Acceso demo creado' : createdUser.isReset ? '🔑 Contraseña reseteada' : '✅ Usuario creado'} onClose={()=>setCreatedUser(null)}>
          <div style={{ background:'#10b98112', border:'1px solid #10b98140', borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
            <div style={{ fontSize:'13px', color:'var(--text2)', marginBottom:'12px' }}>
              {createdUser.isDemo ? 'Compartí estas credenciales con tu prospecto:' : 'Compartí estas credenciales con el usuario:'}
            </div>
            <div style={{ fontFamily:'monospace', fontSize:'14px', display:'flex', flexDirection:'column', gap:'8px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', background:'var(--bg3)', padding:'8px 12px', borderRadius:'6px' }}>
                <span style={{ color:'var(--text3)' }}>Email:</span>
                <span style={{ color:'var(--text)', fontWeight:'600' }}>{createdUser.email}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', background:'var(--bg3)', padding:'8px 12px', borderRadius:'6px' }}>
                <span style={{ color:'var(--text3)' }}>Contraseña:</span>
                <span style={{ color:'#fbbf24', fontWeight:'700', letterSpacing:'1px' }}>{createdUser.tempPassword}</span>
              </div>
              {createdUser.isDemo && (
                <div style={{ display:'flex', justifyContent:'space-between', background:'var(--bg3)', padding:'8px 12px', borderRadius:'6px' }}>
                  <span style={{ color:'var(--text3)' }}>Expira en:</span>
                  <span style={{ color:'#ef4444', fontWeight:'600' }}>30 minutos</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize:'12px', color:'var(--text3)', marginBottom:'16px' }}>
            ⚠️ Guardá esta contraseña ahora. No se puede recuperar después.
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`Email: ${createdUser.email}\nContraseña: ${createdUser.tempPassword}`);
              toast.success('Copiado al portapapeles');
            }}
            style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border2)', color:'var(--text)', borderRadius:'8px', padding:'10px', cursor:'pointer', fontSize:'13px', fontWeight:'600', marginBottom:'10px' }}
          >
            📋 Copiar credenciales
          </button>
          <button onClick={()=>setCreatedUser(null)} className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}>
            Entendido
          </button>
        </Modal>
      )}
    </div>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({ u, currentUser, onToggle, onDelete, onReset, onRoleChange, ROLES, PLANS }) {
  const role = ROLES[u.role] || ROLES.VIEWER;
  const plan = PLANS[u.plan] || PLANS.BASICO;
  const isMe = u.id === currentUser.id;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'12px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'8px', padding:'12px 14px', opacity: u.isActive ? 1 : 0.5 }}>
      <div style={{ width:'36px', height:'36px', borderRadius:'8px', background:`${role.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:0 }}>
        {role.icon}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontWeight:'700', fontSize:'14px' }}>{u.name}</span>
          {isMe && <span style={{ fontSize:'10px', color:'var(--text3)', background:'var(--bg4)', padding:'2px 6px', borderRadius:'4px' }}>Tú</span>}
          {!u.isActive && <span style={{ fontSize:'11px', color:'#ef4444' }}>Desactivado</span>}
        </div>
        <div style={{ fontSize:'12px', color:'var(--text3)', marginTop:'2px' }}>{u.email}</div>
        <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'2px' }}>
          Creado: {format(new Date(u.createdAt), 'dd/MM/yyyy', { locale: es })}
          {u._count && ` · ${u._count.campaigns} campañas`}
        </div>
      </div>

      {/* Role selector */}
      <select
        value={u.role}
        onChange={e => onRoleChange(u, e.target.value)}
        disabled={isMe}
        style={{ background:`${role.color}15`, border:`1px solid ${role.color}40`, color:role.color, borderRadius:'6px', padding:'5px 8px', fontSize:'12px', fontWeight:'600', cursor: isMe ? 'not-allowed' : 'pointer' }}
      >
        {Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
      </select>

      {/* Plan badge */}
      <span style={{ background:`${plan.color}20`, border:`1px solid ${plan.color}40`, color:plan.color, padding:'4px 10px', borderRadius:'10px', fontSize:'11px', fontWeight:'600' }}>
        {plan.label}
      </span>

      {/* Actions */}
      {!isMe && (
        <div style={{ display:'flex', gap:'6px' }}>
          <button onClick={()=>onReset(u)} title="Resetear contraseña" style={{ background:'var(--bg4)', border:'1px solid var(--border2)', color:'var(--text2)', borderRadius:'6px', padding:'5px 8px', cursor:'pointer', fontSize:'13px' }}>🔑</button>
          <button onClick={()=>onToggle(u)} title={u.isActive ? 'Desactivar' : 'Activar'} style={{ background: u.isActive ? '#ef444415' : '#10b98115', border:`1px solid ${u.isActive ? '#ef444440' : '#10b98140'}`, color: u.isActive ? '#f87171' : '#34d399', borderRadius:'6px', padding:'5px 8px', cursor:'pointer', fontSize:'13px' }}>
            {u.isActive ? '⏸' : '▶️'}
          </button>
          <button onClick={()=>onDelete(u)} title="Eliminar" style={{ background:'#ef444415', border:'1px solid #ef444440', color:'#f87171', borderRadius:'6px', padding:'5px 8px', cursor:'pointer', fontSize:'13px' }}>🗑</button>
        </div>
      )}
    </div>
  );
}

// ─── Demo User Row ────────────────────────────────────────────────────────────
function DemoUserRow({ u, isExpired, timeLeft, onExtend, onDelete, onReset }) {
  const [, forceUpdate] = useState(0);

  // Actualizar el countdown cada segundo
  useEffect(() => {
    const iv = setInterval(() => forceUpdate(n => n+1), 1000);
    return () => clearInterval(iv);
  }, []);

  const expired = isExpired(u);
  const remaining = timeLeft(u);

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'12px', background: expired ? '#ef444408' : '#f59e0b08', border:`1px solid ${expired ? '#ef444430' : '#f59e0b30'}`, borderRadius:'8px', padding:'12px 14px' }}>
      <span style={{ fontSize:'20px' }}>⏱</span>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:'700', fontSize:'13px' }}>{u.name}</div>
        <div style={{ fontSize:'12px', color:'var(--text3)' }}>{u.email}</div>
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'2px' }}>Tiempo restante</div>
        <div style={{ fontWeight:'700', fontSize:'14px', color: expired ? '#ef4444' : '#f59e0b', fontFamily:'monospace' }}>
          {remaining}
        </div>
      </div>
      <div style={{ display:'flex', gap:'6px' }}>
        {!expired && (
          <button onClick={()=>onExtend(u)} style={{ background:'#f59e0b20', border:'1px solid #f59e0b40', color:'#fbbf24', borderRadius:'6px', padding:'5px 10px', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>
            +30min
          </button>
        )}
        <button onClick={()=>onReset(u)} title="Nueva contraseña" style={{ background:'var(--bg4)', border:'1px solid var(--border2)', color:'var(--text2)', borderRadius:'6px', padding:'5px 8px', cursor:'pointer', fontSize:'13px' }}>🔑</button>
        <button onClick={()=>onDelete(u)} style={{ background:'#ef444415', border:'1px solid #ef444440', color:'#f87171', borderRadius:'6px', padding:'5px 8px', cursor:'pointer', fontSize:'13px' }}>🗑</button>
      </div>
    </div>
  );
}

// ─── Modal helper ─────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'#000000aa', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="card" style={{ width:'480px', maxHeight:'90vh', overflowY:'auto', padding:'28px' }}>
        <div style={{ fontSize:'17px', fontWeight:'700', marginBottom:'20px' }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, label }) {
  return (
    <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'20px' }}>
      <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      <button className="btn btn-primary" onClick={onConfirm}>{label}</button>
    </div>
  );
}
