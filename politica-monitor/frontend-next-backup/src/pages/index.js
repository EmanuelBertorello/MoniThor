// src/pages/index.js
// Si el usuario tiene sesión activa → dashboard
// Si no → landing page comercial
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import Landing from './landing';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading]);

  // Si está cargando o tiene sesión → spinner
  if (loading || user) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#060b18' }}>
        <div style={{ textAlign:'center', color:'#64748b' }}>
          <div style={{ fontSize:'40px', marginBottom:'16px' }}>📡</div>
          <p style={{ fontSize:'14px' }}>Cargando...</p>
        </div>
      </div>
    );
  }

  // Sin sesión → landing comercial
  return <Landing />;
}
