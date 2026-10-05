import React from 'react';
import { AlertTriangle, RefreshCw, Home, ServerOff } from 'lucide-react';
import { API_BASE_URL, isBackendConfigured } from '../services/api';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an unhandled component error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      const isNetworkIssue =
        !isBackendConfigured ||
        (this.state.error?.message &&
          (this.state.error.message.includes('Backend Unreachable') ||
            this.state.error.message.includes('Network Error') ||
            this.state.error.message.includes('HTML')));

      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '620px',
              width: '100%',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '2.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '12px',
                  background: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                  flexShrink: 0,
                }}
              >
                {isNetworkIssue ? <ServerOff size={28} /> : <AlertTriangle size={28} />}
              </div>
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {isNetworkIssue ? 'Backend Service Unreachable' : 'Application Notice'}
                </h2>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  RoadPulse AI &bull; Urban Road Intelligence Platform
                </span>
              </div>
            </div>

            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '1rem 1.25rem',
                color: '#991b1b',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                marginBottom: '1.5rem',
              }}
            >
              <strong>{isNetworkIssue ? 'Connection Error:' : 'Display Error:'}</strong>{' '}
              {this.state.error?.message || 'The application encountered an unexpected error while loading data.'}
            </div>

            {isNetworkIssue && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1rem 1.25rem',
                  fontSize: '0.82rem',
                  color: '#334155',
                  lineHeight: 1.6,
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem' }}>
                  How to resolve this:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                  <li>
                    <strong>On Vercel:</strong> You must configure <code>VITE_API_URL</code> in your{' '}
                    <em>Vercel Project Settings &rarr; Environment Variables</em> pointing to your live backend (e.g.{' '}
                    <code>https://your-backend.onrender.com</code>), then trigger a <em>Redeploy</em>.
                  </li>
                  <li>
                    <strong>Running Locally:</strong> Ensure your backend is running:{' '}
                    <code>python -m uvicorn app.main:app --port 8000</code>.
                  </li>
                  <li>
                    <strong>Current Configured API:</strong>{' '}
                    <code>{API_BASE_URL || '(None - defaulting to Vercel origin)'}</code>
                  </li>
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button
                onClick={this.handleReload}
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem',
                }}
              >
                <RefreshCw size={15} /> Reload Page
              </button>
              <button
                onClick={this.handleGoHome}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.85rem',
                }}
              >
                <Home size={15} /> Go to Dashboard
              </button>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
              <button
                onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {this.state.showDetails ? 'Hide Technical Stack Trace' : 'Show Technical Stack Trace'}
              </button>

              {this.state.showDetails && (
                <pre
                  style={{
                    marginTop: '0.75rem',
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '1rem',
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '200px',
                  }}
                >
                  {this.state.error?.stack || 'No stack trace available'}
                  {'\n\nComponent Stack:\n'}
                  {this.state.errorInfo?.componentStack || 'No component stack'}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
