import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Sliders, Shield, Database, Cpu, CheckCircle, Globe, RefreshCw, Server } from 'lucide-react';
import { adminService, videoService, API_BASE_URL, checkBackendHealth, getBackendStatus } from '../services/api';

const Settings = () => {
  const [settings, setSettings] = useState({
    pixels_to_meters_width: 0.0028,
    pixels_to_meters_length: 0.0035,
    st_dbscan_spatial_threshold_m: 18.0,
    st_dbscan_temporal_threshold_s: 45.0,
    mqtt_broker_status: 'REST API Fallback (Prototype Mode)',
  });
  const [modelStatus, setModelStatus] = useState(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [resetMessage, setResetMessage] = useState(false);
  const [backendHealth, setBackendHealth] = useState({ checked: false, isOnline: false, testing: false });

  const testApi = async () => {
    setBackendHealth((prev) => ({ ...prev, testing: true }));
    const ok = await checkBackendHealth();
    setBackendHealth({ checked: true, isOnline: ok, testing: false });
  };

  useEffect(() => {
    adminService.getSettings().then((res) => setSettings(res.data)).catch(() => {});
    videoService.getStatus().then((res) => setModelStatus(res.data)).catch(() => {});
    testApi();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await adminService.updateSettings(settings);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 3000);
    } catch (e) {
      alert('Error updating settings');
    }
  };

  const handleResetDatabase = async () => {
    if (window.confirm('Are you sure you want to reset the database? This will clear all incidents, detections, and notifications, returning the platform to a clean 0 state.')) {
      try {
        await adminService.resetDatabase();
        setResetMessage(true);
        setTimeout(() => setResetMessage(false), 4000);
      } catch (e) {
        alert('Error resetting database');
      }
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
          System Settings & Calibration
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
          Configure computer vision scale factors, spatio-temporal clustering limits, and prototype telemetry options
        </p>
      </div>

      {savedMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} />
          <span>Calibration settings updated successfully!</span>
        </div>
      )}

      {/* Cloud Deployment & Backend Connectivity Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={18} color="#0284c7" />
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Backend API & Cloud Connectivity
            </h3>
          </div>
          <button
            onClick={testApi}
            disabled={backendHealth.testing}
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', gap: '0.3rem' }}
          >
            <RefreshCw size={13} className={backendHealth.testing ? 'animate-spin' : ''} />
            {backendHealth.testing ? 'Pinging...' : 'Test Connection'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Current Hostname:</span>
            <span className="font-mono" style={{ fontSize: '0.8rem', color: '#0f172a' }}>
              {typeof window !== 'undefined' ? window.location.hostname : 'localhost'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Configured API Target (VITE_API_URL):</span>
            <span className="font-mono" style={{ fontSize: '0.8rem', color: '#0284c7' }}>
              {API_BASE_URL || '(Empty / Relative same-origin)'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
            <span style={{ color: '#64748b' }}>Live Service Status:</span>
            <span
              style={{
                fontWeight: 700,
                color: backendHealth.isOnline ? '#059669' : '#dc2626',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: backendHealth.isOnline ? '#10b981' : '#ef4444',
                }}
              />
              {backendHealth.isOnline ? 'ONLINE (HTTP 200 /health)' : 'DISCONNECTED / UNREACHABLE'}
            </span>
          </div>
        </div>

        {!backendHealth.isOnline && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              borderRadius: '6px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              fontSize: '0.78rem',
              color: '#991b1b',
              lineHeight: 1.5,
            }}
          >
            <strong>Connection Fix:</strong> Set <code>VITE_API_URL</code> in your Vercel Project Settings &rarr; Environment Variables to your live backend URL (e.g. on Render: <code>https://roadpulse-backend.onrender.com</code>), then trigger a Redeploy.
          </div>
        )}
      </div>

      {/* AI Model Status Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Cpu size={18} color="#0284c7" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            AI Inference Engine Diagnostics
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Current Engine Mode:</span>
            <strong style={{ color: '#0284c7' }}>{modelStatus?.mode || 'DEMO_MODE (Simulated Hazard Inference)'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b' }}>Custom Weights Target Path:</span>
            <span className="font-mono" style={{ fontSize: '0.75rem', color: '#0f172a' }}>backend/models/best.pt</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
            <span style={{ color: '#64748b' }}>Custom Weights Found:</span>
            <span style={{ color: modelStatus?.custom_weights_found ? '#059669' : '#d97706', fontWeight: 600 }}>
              {modelStatus?.custom_weights_found ? 'YES (Active)' : 'NO (Operating in Technical Demo Mode)'}
            </span>
          </div>
        </div>
      </div>

      {/* Calibration Form */}
      <form onSubmit={handleSave} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <Sliders size={18} color="#d97706" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            Road Damage Perspective Scale Factors
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>
              Width Scale (Meters per Pixel):
            </label>
            <input
              type="number"
              step="0.0001"
              value={settings.pixels_to_meters_width}
              onChange={(e) => setSettings({ ...settings, pixels_to_meters_width: parseFloat(e.target.value) })}
              style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>
              Length Scale (Meters per Pixel):
            </label>
            <input
              type="number"
              step="0.0001"
              value={settings.pixels_to_meters_length}
              onChange={(e) => setSettings({ ...settings, pixels_to_meters_length: parseFloat(e.target.value) })}
              style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
            ST-DBSCAN Spatio-Temporal Deduplication Limits
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>
                Spatial Distance Threshold (Meters):
              </label>
              <input
                type="number"
                step="1"
                value={settings.st_dbscan_spatial_threshold_m}
                onChange={(e) => setSettings({ ...settings, st_dbscan_spatial_threshold_m: parseFloat(e.target.value) })}
                style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.3rem' }}>
                Temporal Window Threshold (Seconds):
              </label>
              <input
                type="number"
                step="1"
                value={settings.st_dbscan_temporal_threshold_s}
                onChange={(e) => setSettings({ ...settings, st_dbscan_temporal_threshold_s: parseFloat(e.target.value) })}
                style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '0.6rem 1.5rem', marginTop: '0.5rem' }}>
          Save Calibration Parameters
        </button>
      </form>

      {/* Database Reset to Blank / Zero State */}
      <div className="card" style={{ borderLeft: '4px solid #ef4444', background: '#fff5f5', border: '1px solid #fecaca' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <Database size={18} color="#ef4444" />
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#991b1b' }}>
            Database Operations (Blank / Zero State)
          </h4>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#7f1d1d', lineHeight: '1.5', marginBottom: '1rem' }}>
          Clear all operational records (incidents, detections, notifications, and assignments) to reset the entire platform to zero for fresh student testing or demonstration. Retains login accounts and Pune route structures.
        </p>
        <button
          type="button"
          onClick={handleResetDatabase}
          className="btn btn-danger"
          style={{ padding: '0.6rem 1.25rem', fontSize: '0.82rem', fontWeight: 700, alignSelf: 'flex-start' }}
        >
          Reset All Data (Wipe to Zero)
        </button>
      </div>

      {resetMessage && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} />
          <span>All operational data has been successfully wiped to zero!</span>
        </div>
      )}

      {/* Prototype Limitations Notice */}
      <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>

        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem' }}>
          Academic Prototype Technical Notes
        </h4>
        <ul style={{ fontSize: '0.78rem', color: '#64748b', paddingLeft: '1.2rem', lineHeight: '1.6' }}>
          <li>Smartphone cameras act as simulated bus-mounted mobile sensor units.</li>
          <li>Damage dimensions are estimated approximations based on dashboard mounting assumptions.</li>
          <li>REST architecture is utilized for local prototype execution; MQTT abstraction is ready for hardware edge deployment.</li>
          <li>SQLite is selected for zero-configuration laptop demonstration, with database schemas structured for seamless PostgreSQL/PostGIS migration.</li>
        </ul>
      </div>
    </div>
  );
};

export default Settings;
