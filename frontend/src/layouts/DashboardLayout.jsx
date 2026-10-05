import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import BackendUnreachableBanner from '../components/BackendUnreachableBanner';
import {
  LayoutDashboard,
  Camera,
  UploadCloud,
  AlertTriangle,
  Map,
  Layers,
  BarChart3,
  Bus,
} from 'lucide-react';

const DashboardLayout = ({ currentUser, onLogout, onDemoStart }) => {
  const navTabs = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/camera', label: 'Camera & Live GPS', icon: Camera },
    { to: '/upload', label: 'AI Video Pipeline', icon: UploadCloud },
    { to: '/incidents', label: 'Incidents Center', icon: AlertTriangle },
    { to: '/map', label: 'GIS Live Map', icon: Map },
    { to: '/sessions', label: 'Sessions DB', icon: Layers },
    { to: '/analytics', label: 'City Analytics', icon: BarChart3 },
    { to: '/fleet', label: 'Fleet & Buses', icon: Bus },
  ];

  return (
    <div className="app-container">
      <Sidebar currentUser={currentUser} />
      <div className="main-content">
        <Navbar currentUser={currentUser} onLogout={onLogout} onDemoStart={onDemoStart} />

        {/* INTERCONNECTED ALL-PAGES SUB-NAVBAR */}
        <div
          style={{
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            padding: '0.45rem 1.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginRight: '0.4rem',
            }}
          >
            All Modules:
          </span>
          {navTabs.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.32rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#0284c7' : '#64748b',
                background: isActive ? '#f0f9ff' : 'transparent',
                border: isActive ? '1px solid #bae6fd' : '1px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              })}
            >
              <item.icon size={14} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <main className="page-container">
          <BackendUnreachableBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
