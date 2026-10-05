import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Layers,
  Video,
  Camera,
  Upload,
  Calendar,
  Clock,
  Navigation,
  ArrowRight,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { sessionService } from '../services/api';

const Sessions = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await sessionService.getSessions();
      setSessions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError(err.message || 'Failed to load sessions from server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete session ${id}?`)) return;
    try {
      await sessionService.deleteSession(id);
      fetchSessions();
    } catch (err) {
      alert('Failed to delete session: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
            Monitoring Sessions
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
            Historical road inspection sessions from uploaded videos and live smartphone camera feeds
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={fetchSessions} className="btn btn-secondary" style={{ gap: '0.4rem' }}>
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link to="/upload" className="btn btn-primary" style={{ gap: '0.4rem', textDecoration: 'none' }}>
            <Upload size={15} />
            Upload Video
          </Link>
          <Link to="/camera" className="btn btn-primary" style={{ gap: '0.4rem', textDecoration: 'none', background: '#0284c7' }}>
            <Camera size={15} />
            Live Camera
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem auto' }} />
            Loading sessions from database...
          </div>
        ) : sessions.length === 0 ? (
          /* EMPTY STATE */
          <div style={{ padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', marginBottom: '1.25rem' }}>
              <FolderOpen size={32} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem' }}>
              No sessions yet
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: '420px', marginBottom: '1.75rem' }}>
              No road monitoring sessions have been processed. Upload a video file or record a live camera trip to run the AI detection pipeline.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none', gap: '0.4rem' }}>
                <Upload size={16} /> Upload Video
              </Link>
              <Link to="/camera" className="btn btn-secondary" style={{ textDecoration: 'none', gap: '0.4rem' }}>
                <Camera size={16} /> Record Live Trip
              </Link>
            </div>
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Source</th>
                  <th>Distance</th>
                  <th>Duration</th>
                  <th>Detections</th>
                  <th>Incidents</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((ses) => (
                  <tr
                    key={ses.id}
                    onClick={() => navigate(`/sessions/${ses.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ fontWeight: 700, color: '#0284c7' }}>
                        {ses.id}
                      </div>
                      {ses.video_filename && (
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {ses.video_filename}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: ses.source === 'live' ? '#e0f2fe' : '#f3e8ff',
                          color: ses.source === 'live' ? '#0369a1' : '#7e22ce',
                        }}
                      >
                        {ses.source === 'live' ? <Camera size={12} /> : <Video size={12} />}
                        {ses.source.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>
                        {ses.distance_m >= 1000 ? `${(ses.distance_m / 1000).toFixed(2)} km` : `${Math.round(ses.distance_m)} m`}
                      </span>
                      {ses.distance_source && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          {ses.distance_source}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ color: '#475569' }}>
                        {ses.video_duration_s ? `${Math.round(ses.video_duration_s)}s` : '-'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        {ses.detections_count}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: ses.incidents_count > 0 ? '#ef4444' : '#10b981' }}>
                        {ses.incidents_count}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background:
                            ses.status === 'completed'
                              ? '#dcfce7'
                              : ses.status === 'failed'
                              ? '#fee2e2'
                              : '#fef3c7',
                          color:
                            ses.status === 'completed'
                              ? '#059669'
                              : ses.status === 'failed'
                              ? '#dc2626'
                              : '#d97706',
                        }}
                      >
                        {ses.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {ses.created_at ? new Date(ses.created_at).toLocaleString() : '-'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Link
                          to={`/sessions/${ses.id}`}
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', textDecoration: 'none' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Detail <ArrowRight size={12} />
                        </Link>
                        <button
                          onClick={(e) => handleDelete(ses.id, e)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '0.3rem',
                          }}
                          title="Delete session"
                        >
                          <Trash2 size={15} hover={{ color: '#ef4444' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sessions;
