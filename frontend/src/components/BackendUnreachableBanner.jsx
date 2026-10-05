import React, { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, X, ServerOff, ExternalLink } from 'lucide-react';
import { API_BASE_URL, isBackendConfigured, subscribeBackendStatus, checkBackendHealth } from '../services/api';

const BackendUnreachableBanner = () => {
  const [status, setStatus] = useState({
    isReachable: isBackendConfigured,
    message: isBackendConfigured ? '' : 'VITE_API_URL is not configured in Vercel settings.',
    url: API_BASE_URL,
  });
  const [isChecking, setIsChecking] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeBackendStatus((newStatus) => {
      setStatus(newStatus);
    });

    // Check health once on mount
    checkBackendHealth();

    return () => unsubscribe();
  }, []);

  if (status.isReachable || isDismissed) {
    return null;
  }

  const handleRetry = async () => {
    setIsChecking(true);
    await checkBackendHealth();
    setIsChecking(false);
  };

  const isVercelHost =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  return (
    <div
      style={{
        background: '#fff1f2',
        border: '1px solid #fecdd3',
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        margin: '0 0 1.25rem 0',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
        boxShadow: '0 2px 4px rgba(225, 29, 72, 0.05)',
      }}
    >
      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: '#ffe4e6',
            color: '#e11d48',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
          }}
        >
          <ServerOff size={20} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <strong style={{ fontSize: '0.92rem', color: '#9f1239' }}>
              Backend Unreachable — Live Data Unavailable
            </strong>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                background: '#fda4af',
                color: '#881337',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              DISCONNECTED
            </span>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#4c0519', margin: '0 0 0.5rem 0', lineHeight: 1.45 }}>
            {status.message || 'Cannot communicate with the RoadPulse AI backend server.'}
          </p>

          <div
            style={{
              fontSize: '0.75rem',
              color: '#475569',
              background: '#ffffff',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #fed7aa',
              marginBottom: '0.5rem',
              lineHeight: 1.5,
            }}
          >
            {isVercelHost ? (
              <>
                <strong>How to fix on Vercel:</strong> In your Vercel project dashboard, go to{' '}
                <em>Settings &rarr; Environment Variables</em>, add <code>VITE_API_URL</code> set to your live
                backend URL (e.g. on Render: <code>https://your-service.onrender.com</code>), and click{' '}
                <strong>Redeploy</strong>.
              </>
            ) : (
              <>
                <strong>How to fix locally:</strong> Start the backend service with{' '}
                <code>python -m uvicorn app.main:app --port 8000</code>.
              </>
            )}
            <br />
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Configured API Target: <code>{status.url || '(relative same-origin)'}</code>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={handleRetry}
              disabled={isChecking}
              className="btn btn-secondary"
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.75rem',
                background: '#ffffff',
                borderColor: '#f43f5e',
                color: '#e11d48',
                gap: '0.3rem',
              }}
            >
              <RefreshCw size={13} className={isChecking ? 'animate-spin' : ''} />
              {isChecking ? 'Checking...' : 'Retry Connection'}
            </button>
            <a
              href="/settings"
              style={{
                fontSize: '0.75rem',
                color: '#0284c7',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                marginLeft: '0.5rem',
              }}
            >
              API Diagnostics &rarr;
            </a>
          </div>
        </div>
      </div>

      <button
        onClick={() => setIsDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          color: '#9f1239',
          cursor: 'pointer',
          padding: '0.25rem',
          borderRadius: '4px',
          opacity: 0.7,
        }}
        title="Dismiss warning"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default BackendUnreachableBanner;
