import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';

function firebaseAuthErrorMessage(err) {
  switch (err.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Credenciales incorrectas';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Probá de nuevo más tarde';
    case 'auth/invalid-email':
      return 'Email inválido';
    case 'auth/user-disabled':
      return 'Cuenta desactivada';
    default:
      return 'Error al iniciar sesión';
  }
}

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      router.push('/dashboard');
    } catch (err) {
      toast.error(firebaseAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Ambient glow */}
      <div className="login-glow login-glow-1" />
      <div className="login-glow login-glow-2" />

      <div className="login-container">
        {/* Logo */}
        <div className="login-header">
          <div className="login-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
              <path d="M2 12 L6 10 M22 12 L18 10 M2 16 L7 13 M22 16 L17 13"/>
            </svg>
          </div>
          <h1 className="login-title">
            Politica<span>Monitor</span>
          </h1>
          <p className="login-subtitle">Inteligencia política en tiempo real</p>
        </div>

        {/* Card */}
        <div className="login-card">
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required
                autoComplete="email"
              />
            </div>
            <div className="login-field">
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
              {loading ? (
                <span className="login-spinner" />
              ) : (
                'Ingresar'
              )}
            </button>
          </form>

          <div className="login-footer">
            <div className="login-signal" />
            <span>Conexión segura · Datos encriptados</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }

        .login-glow {
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(80px);
        }

        .login-glow-1 {
          width: 600px;
          height: 600px;
          top: -15%;
          left: 40%;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.08) 0%, transparent 70%);
        }

        .login-glow-2 {
          width: 400px;
          height: 400px;
          bottom: -10%;
          right: 20%;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%);
        }

        .login-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 400px;
          animation: modalSlideUp 400ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-logo {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, #0EA5E9, #8B5CF6);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          color: white;
          box-shadow: 0 4px 24px rgba(14, 165, 233, 0.3);
        }

        .login-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text);
        }

        .login-title span {
          color: var(--accent);
        }

        .login-subtitle {
          color: var(--text3);
          font-size: 14px;
          margin-top: 4px;
          font-weight: 400;
        }

        .login-card {
          background: var(--bg2);
          border: 1px solid var(--border2);
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.3), 0 0 80px rgba(14, 165, 233, 0.04);
        }

        .login-field {
          margin-bottom: 18px;
        }

        .login-field input {
          padding: 12px 16px;
          font-size: 15px;
          border-radius: 12px;
        }

        .login-btn {
          width: 100%;
          padding: 13px;
          font-size: 15px;
          font-weight: 700;
          border-radius: 12px;
          margin-top: 6px;
          min-height: 48px;
        }

        .login-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 600ms linear infinite;
        }

        .login-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
        }

        .login-footer span {
          font-size: 11px;
          color: var(--text3);
          letter-spacing: 0.3px;
        }

        .login-signal {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--positive);
          animation: livePulse 2s ease-in-out infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 480px) {
          .login-card { padding: 24px 20px; border-radius: 16px; }
          .login-title { font-size: 22px; }
        }
      `}</style>
    </div>
  );
}
