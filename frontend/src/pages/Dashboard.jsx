import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Layers,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Sparkles,
  Camera,
  Activity,
} from 'lucide-react';
import { analyticsService, incidentService, routeService } from '../services/api';
import StatCard from '../components/StatCard';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';
import IncidentMap from '../components/IncidentMap';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';

const Dashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [fetchError, setFetchError] = useState(null);

  const fetchData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [analyticsRes, incidentsRes, routesRes] = await Promise.all([
        analyticsService.getAnalytics().catch((e) => {
          console.warn('Analytics unavailable:', e.message);
          return { data: null };
        }),
        incidentService.getIncidents({ limit: 10 }).catch((e) => {
          console.warn('Incidents unavailable:', e.message);
          return { data: [] };
        }),
        routeService.getRoutes().catch((e) => {
          console.warn('Routes unavailable:', e.message);
          return { data: [] };
        }),
      ]);
      setAnalytics(analyticsRes?.data || null);
      setIncidents(Array.isArray(incidentsRes?.data) ? incidentsRes.data : []);
      setRoutes(Array.isArray(routesRes?.data) ? routesRes.data : []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setFetchError(err.message || 'Failed to load live data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const summary = analytics?.summary || {
    total_incidents: 0,
    new_incidents: 0,
    verified_incidents: 0,
    in_progress_incidents: 0,
    resolved_incidents: 0,
    critical_incidents: 0,
  };

  const safeRoutes = Array.isArray(routes) ? routes : [];
  const route1 = safeRoutes.find((r) => r.route_code === 'PUNE-RT-01' || r.route_code === 'PUNE-R01');
  let waypoints = [];
  try {
    if (route1?.waypoints_json) {
      waypoints = typeof route1.waypoints_json === 'string' ? JSON.parse(route1.waypoints_json) : route1.waypoints_json;
    }
  } catch {
    waypoints = [];
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Banner & Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Municipal Urban Intelligence Center
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
            Real-time road surface quality and hazard telemetry powered by public bus smartphone camera edge feeds
          </p>
        </div>

        <button onClick={fetchData} className="btn btn-secondary" style={{ gap: '0.4rem' }}>
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Refresh Data
        </button>
      </div>

      {/* TOP 6 STATISTICS CARDS */}
      <div className="grid-cols-4">
        <StatCard
          title="Total Incidents"
          value={summary.total_incidents}
          icon={Layers}
          color="#2563eb"
          subtitle="Cumulative road hazards"
        />
        <StatCard
          title="Critical Hazards"
          value={summary.critical_incidents}
          icon={ShieldAlert}
          color="#dc2626"
          subtitle="Immediate hazard action required"
        />
        <StatCard
          title="New Detections"
          value={summary.new_incidents}
          icon={AlertTriangle}
          color="#d97706"
          subtitle="Awaiting municipal verification"
        />
        <StatCard
          title="Verified"
          value={summary.verified_incidents}
          icon={CheckCircle2}
          color="#7c3aed"
          subtitle="Confirmed by authority"
        />
        <StatCard
          title="In Progress"
          value={summary.in_progress_incidents}
          icon={Clock}
          color="#0284c7"
          subtitle="Assigned to repair squads"
        />
        <StatCard
          title="Resolved"
          value={summary.resolved_incidents}
          icon={CheckCircle2}
          color="#059669"
          subtitle="Repaired & closed"
        />
      </div>

      {/* INTERCONNECTED PLATFORM QUICK LAUNCHER */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.85rem',
        }}
      >
        <Link
          to="/camera"
          style={{
            background: '#ffffff',
            border: '1px solid #bae6fd',
            borderRadius: '10px',
            padding: '1rem',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ background: '#0284c7', color: '#fff', borderRadius: '8px', padding: '0.5rem', display: 'flex' }}>
            <Camera size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>Live Camera Feed</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Phone mount & GPS tracking</div>
          </div>
        </Link>

        <Link
          to="/upload"
          style={{
            background: '#ffffff',
            border: '1px solid #fde68a',
            borderRadius: '10px',
            padding: '1rem',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ background: '#d97706', color: '#fff', borderRadius: '8px', padding: '0.5rem', display: 'flex' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>AI Video Ingestion</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Road validation & ST-DBSCAN</div>
          </div>
        </Link>

        <Link
          to="/incidents"
          style={{
            background: '#ffffff',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '1rem',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ background: '#dc2626', color: '#fff', borderRadius: '8px', padding: '0.5rem', display: 'flex' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>Incidents Center</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Manage verified hazards</div>
          </div>
        </Link>

        <Link
          to="/map"
          style={{
            background: '#ffffff',
            border: '1px solid #a7f3d0',
            borderRadius: '10px',
            padding: '1rem',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ background: '#059669', color: '#fff', borderRadius: '8px', padding: '0.5rem', display: 'flex' }}>
            <Activity size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>GIS Live Map</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Pune heatmaps & routes</div>
          </div>
        </Link>

        <Link
          to="/sessions"
          style={{
            background: '#ffffff',
            border: '1px solid #ddd6fe',
            borderRadius: '10px',
            padding: '1rem',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ background: '#7c3aed', color: '#fff', borderRadius: '8px', padding: '0.5rem', display: 'flex' }}>
            <Layers size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>Survey Sessions</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Relational DB history</div>
          </div>
        </Link>
      </div>

      {/* MAIN SECTION 1 & 2: LIVE MAP & RECENT INCIDENTS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.3fr', gap: '1.5rem' }}>
        {/* Live Incident Map */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                Live Incident Map (Pune Transit Corridor)
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Showing active potholes & hazards mapped along Pune Route 01
              </span>
            </div>
            <Link to="/map" style={{ fontSize: '0.8rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none', fontWeight: 600 }}>
              Full Screen Map <ArrowRight size={14} />
            </Link>
          </div>

          <div style={{ flex: 1, minHeight: '380px' }}>
            <IncidentMap
              incidents={incidents}
              routeWaypoints={waypoints}
              height="380px"
              zoom={13}
            />
          </div>
        </div>

        {/* Recent Incidents List */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                Recent Road Incidents
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Latest AI detections after ST-DBSCAN deduplication
              </span>
            </div>
            <Link to="/incidents" style={{ fontSize: '0.8rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none', fontWeight: 600 }}>
              View All <ArrowRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', overflowY: 'auto', maxHeight: '380px' }}>
            {incidents.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
                <CheckCircle2 size={36} color="#059669" style={{ margin: '0 auto 0.75rem auto' }} />
                <h4 style={{ color: '#0f172a', fontWeight: 700, marginBottom: '0.3rem' }}>No hazards detected</h4>
                <p style={{ fontSize: '0.82rem', marginBottom: '1.25rem' }}>No incidents recorded yet. Start a survey trip or upload road video.</p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <Link to="/upload" className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
                    Upload Video
                  </Link>
                  <Link to="/camera" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
                    Live Camera
                  </Link>
                </div>
              </div>
            ) : (
              incidents.slice(0, 5).map((inc) => (
                <Link
                  key={inc.id}
                  to={`/incidents/${inc.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 0.9rem',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: '#fee2e2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#dc2626',
                      }}
                    >
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{inc.incident_code}</strong>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({inc.hazard_type || inc.class})</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {inc.location_label || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`} &bull; Area: {inc.estimated_area_m2}m²
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                    <SeverityBadge severity={inc.severity} />
                    <StatusBadge status={inc.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CHARTS ROW: SEVERITY DISTRIBUTION & ROUTE INCIDENTS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        {/* Severity Distribution */}
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            Severity Distribution
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '1rem' }}>
            Breakdown across severity tiers
          </span>

          <div style={{ height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.by_severity || []}>
                <XAxis dataKey="severity" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]}>
                  {(analytics?.by_severity || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || '#2563eb'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Incidents by Route */}
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            Incidents by Transit Route
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '1rem' }}>
            Hazard frequency across surveyed routes
          </span>

          <div style={{ height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={analytics?.by_route || []}>
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis dataKey="route_name" type="category" width={110} stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="incident_count" fill="#0284c7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hazard Types (Pie/Donut) */}
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            Hazard Classification
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '1rem' }}>
            Potholes vs cracks vs damaged pavement
          </span>

          <div style={{ height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics?.by_hazard_type || []}
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(analytics?.by_hazard_type || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || '#2563eb'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
