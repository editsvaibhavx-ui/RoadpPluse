import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Play,
  Bus,
  Camera,
  MapPin,
  LogOut,
  User,
  Shield,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import { notificationService, videoService } from '../services/api';

const Navbar = ({ currentUser, onLogout, onDemoStart }) => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDemoRunning, setIsDemoRunning] = useState(false);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnread = async () => {
    try {
      const res = await notificationService.getNotifications();
      const count = res.data.filter((n) => !n.is_read).length;
      setUnreadCount(count);
    } catch {
      // ignore
    }
  };

  const handleStartDemoClick = async () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    try {
      if (onDemoStart) {
        await onDemoStart();
      } else {
        await videoService.startDemo();
        navigate('/incidents');
      }
    } catch (e) {
      console.error('Demo execution notice:', e);
    } finally {
      setIsDemoRunning(false);
      fetchUnread();
    }
  };

  return (
    <header
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0.75rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      {/* Left: Branding & Dashboard Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.02em',
              }}
            >
              RoadPulse AI
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                background: '#e0f2fe',
                color: '#0369a1',
                border: '1px solid #bae6fd',
                fontWeight: 700,
              }}
            >
              PROTOTYPE
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
            Municipal Urban Intelligence Center &bull; Pune Smart Transit
          </div>
        </div>

        {/* Live Simulation Meta Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.3rem 0.75rem',
              borderRadius: '20px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: '0.75rem',
              color: '#334155',
            }}
          >
            <Camera size={13} color="#0284c7" />
            <span>Camera Source: <strong>Smartphone Camera</strong></span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.3rem 0.75rem',
              borderRadius: '20px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: '0.75rem',
              color: '#334155',
            }}
          >
            <Bus size={13} color="#059669" />
            <span>Simulated Bus ID: <strong>BUS-001</strong></span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.3rem 0.75rem',
              borderRadius: '20px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: '0.75rem',
              color: '#334155',
            }}
          >
            <MapPin size={13} color="#d97706" />
            <span>Route: <strong>Pune Route 01</strong></span>
          </div>
        </div>
      </div>

      {/* Right: Master 1-Click START DEMO button, Notifications, User Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Master START DEMO Button */}
        <button
          onClick={handleStartDemoClick}
          disabled={isDemoRunning}
          className="btn btn-demo"
          style={{
            padding: '0.55rem 1.25rem',
            fontSize: '0.85rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Sparkles size={16} />
          {isDemoRunning ? 'RUNNING DEMO PIPELINE...' : 'START DEMO'}
        </button>

        {/* Notifications Bell */}
        <button
          onClick={() => navigate('/notifications')}
          style={{
            position: 'relative',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '0.55rem',
            color: '#475569',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: '#ef4444',
                color: '#ffffff',
                fontSize: '0.65rem',
                fontWeight: 700,
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #ffffff',
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>

        {/* User Role Badge & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderLeft: '1px solid #e2e8f0', paddingLeft: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
              {currentUser?.full_name || currentUser?.username || 'Municipal Officer'}
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: currentUser?.role === 'admin' ? '#0284c7' : '#059669',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {currentUser?.role === 'admin' ? 'Administrator' : 'Municipal Authority'}
            </span>
          </div>

          <button
            onClick={onLogout}
            title="Log Out"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px',
              display: 'flex',
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
