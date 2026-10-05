import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, User, Sparkles, AlertCircle } from 'lucide-react';
import { authService } from '../services/api';

const Login = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await authService.login(username, password);
      if (onLoginSuccess) onLoginSuccess(data.user);
      navigate('/dashboard');
    } catch (err) {
      if (err.isBackendUnreachable || (err.message && err.message.includes('Backend Unreachable'))) {
        setError('Backend service is unreachable. If deployed on Vercel, please configure VITE_API_URL in your Vercel Project Settings pointing to your deployed Render backend (e.g. https://roadpulse-backend.onrender.com), then Redeploy.');
      } else if (!err.response) {
        setError('Cannot connect to backend server. Please check your network connection or verify that the backend is running.');
      } else {
        setError(err.response?.data?.detail || err.message || 'Login failed. Check credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const setCredentials = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '2.5rem',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            }}
          >
            <Shield size={28} />
          </div>
          <h1
            style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '0.25rem',
            }}
          >
            RoadPulse AI
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
            AI-Powered Mobile Urban Road Intelligence Platform
          </p>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
            Municipal Urban Intelligence Center &bull; Pune Smart City
          </div>
        </div>

        {error && (
          <div
            style={{
              background: '#fee2e2',
              border: '1px solid #f87171',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              color: '#b91c1c',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.25rem',
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 1rem 0.65rem 2.4rem',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 1rem 0.65rem 2.4rem',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', fontWeight: 700 }}>
            {isLoading ? 'Authenticating...' : 'Sign In to Command Center'}
          </button>
        </form>

        {/* Demo Credentials Quick Fill */}
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>
            <Sparkles size={14} color="#0284c7" />
            <span>Click to fill Demo Credentials:</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setCredentials('admin', 'admin123')}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.55rem' }}
            >
              admin / admin123
              <br />
              <span style={{ fontSize: '0.65rem', color: '#0284c7', fontWeight: 700 }}>[Admin Role]</span>
            </button>
            <button
              type="button"
              onClick={() => setCredentials('authority', 'authority123')}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.55rem' }}
            >
              authority / authority123
              <br />
              <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 700 }}>[Authority Role]</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
