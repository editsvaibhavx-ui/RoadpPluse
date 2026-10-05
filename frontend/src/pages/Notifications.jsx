import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, ShieldAlert, AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';
import { notificationService } from '../services/api';
import SeverityBadge from '../components/SeverityBadge';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifs = async () => {
    setIsLoading(true);
    try {
      const res = await notificationService.getNotifications();
      setNotifications(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to load notifications:', e);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
  }, []);

  const handleMarkRead = async (id) => {
    try {
      await notificationService.markRead(id);
      fetchNotifs();
    } catch (e) {
      alert('Error marking notification read');
    }
  };

  const handleClearAll = async () => {
    try {
      await notificationService.clearAll();
      fetchNotifs();
    } catch (e) {
      alert('Error clearing notifications');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            Municipal Hazard Notifications
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Automated alerts dispatched for HIGH and CRITICAL road surface defects
          </p>
        </div>

        <button onClick={handleClearAll} className="btn btn-secondary" style={{ gap: '0.4rem' }}>
          <CheckCircle2 size={16} />
          Mark All As Read
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {notifications.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
            No hazard notifications recorded yet.
          </div>
        ) : (
          notifications.map((n) => {
            const isCritical = n.severity === 'CRITICAL';
            return (
              <div
                key={n.id}
                className="card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderLeft: isCritical ? '4px solid #ef4444' : '4px solid #f59e0b',
                  opacity: n.is_read ? 0.75 : 1,
                  background: n.is_read ? '#f8fafc' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: isCritical ? '#fee2e2' : '#fef3c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isCritical ? '#dc2626' : '#d97706',
                      flexShrink: 0,
                    }}
                  >
                    <ShieldAlert size={20} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{n.title}</strong>
                      <SeverityBadge severity={n.severity} />
                      {!n.is_read && (
                        <span style={{ fontSize: '0.65rem', background: '#0284c7', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                          NEW
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: '0.8rem', color: '#334155', lineHeight: '1.4', marginBottom: '0.5rem' }}>
                      {n.message}
                    </p>

                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                  {n.incident_id && (
                    <Link
                      to={`/incidents/${n.incident_id}`}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', gap: '0.3rem' }}
                    >
                      <ExternalLink size={13} /> View
                    </Link>
                  )}

                  {!n.is_read && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                      title="Mark as Read"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Notifications;
