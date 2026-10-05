import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bus,
  Camera,
  UploadCloud,
  Layers,
  Eye,
  AlertTriangle,
  Map,
  BarChart3,
  Bell,
  Users,
  Settings,
  Route as RouteIcon,
  ShieldCheck,
} from 'lucide-react';

const Sidebar = ({ currentUser }) => {
  const isAdmin = currentUser?.role === 'admin';

  const navItemStyle = ({ isActive }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 0.9rem',
    borderRadius: '8px',
    fontSize: '0.85rem',
    fontWeight: isActive ? 700 : 500,
    color: isActive ? '#0284c7' : '#475569',
    background: isActive ? '#f0f9ff' : 'transparent',
    borderLeft: isActive ? '3px solid #0284c7' : '3px solid transparent',
    textDecoration: 'none',
    transition: 'all 0.15s ease',
  });

  return (
    <aside
      style={{
        width: '250px',
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.25rem 0.85rem',
        gap: '1.5rem',
        flexShrink: 0,
      }}
    >
      {/* OPERATIONS SECTION */}
      <div>
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '0 0.85rem 0.5rem',
          }}
        >
          Operations
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <NavLink to="/dashboard" style={navItemStyle}>
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/fleet" style={navItemStyle}>
            <Bus size={18} />
            <span>Bus & Fleet</span>
          </NavLink>
          <NavLink to="/camera" style={navItemStyle}>
            <Camera size={18} />
            <span>Camera Feed</span>
          </NavLink>
          <NavLink to="/upload" style={navItemStyle}>
            <UploadCloud size={18} />
            <span>Video Ingestion</span>
          </NavLink>
          <NavLink to="/sessions" style={navItemStyle}>
            <Layers size={18} />
            <span>Sessions</span>
          </NavLink>
        </div>
      </div>

      {/* INTELLIGENCE SECTION */}
      <div>
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '0 0.85rem 0.5rem',
          }}
        >
          Road Intelligence
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <NavLink to="/detections" style={navItemStyle}>
            <Eye size={18} />
            <span>Raw Detections</span>
          </NavLink>
          <NavLink to="/incidents" style={navItemStyle}>
            <AlertTriangle size={18} />
            <span>Incidents</span>
          </NavLink>
          <NavLink to="/map" style={navItemStyle}>
            <Map size={18} />
            <span>Live Map</span>
          </NavLink>
          <NavLink to="/analytics" style={navItemStyle}>
            <BarChart3 size={18} />
            <span>Analytics</span>
          </NavLink>
          <NavLink to="/notifications" style={navItemStyle}>
            <Bell size={18} />
            <span>Hazard Alerts</span>
          </NavLink>
        </div>
      </div>

      {/* ADMINISTRATION SECTION */}
      <div>
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '0 0.85rem 0.5rem',
          }}
        >
          Administration
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {isAdmin && (
            <NavLink to="/admin/users" style={navItemStyle}>
              <Users size={18} />
              <span>Users</span>
            </NavLink>
          )}
          <NavLink to="/admin/buses" style={navItemStyle}>
            <ShieldCheck size={18} />
            <span>Fleet Config</span>
          </NavLink>
          <NavLink to="/admin/routes" style={navItemStyle}>
            <RouteIcon size={18} />
            <span>Pune Routes</span>
          </NavLink>
          <NavLink to="/settings" style={navItemStyle}>
            <Settings size={18} />
            <span>System Settings</span>
          </NavLink>
        </div>
      </div>

      {/* FOOTER NOTICE */}
      <div
        style={{
          marginTop: 'auto',
          padding: '0.75rem',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: '1.4' }}>
          <strong style={{ color: '#0f172a' }}>College Prototype</strong>
          <br />
          Simulated Edge Telematics
          <br />
          OpenStreetMap &bull; YOLO11 / Demo
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
