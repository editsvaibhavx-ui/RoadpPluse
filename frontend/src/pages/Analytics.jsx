import React, { useState, useEffect } from 'react';
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
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  MapPin,
  Clock,
  ShieldAlert,
  CheckCircle,
  RefreshCw,
  Compass,
} from 'lucide-react';
import { analyticsService } from '../services/api';
import StatCard from '../components/StatCard';

const Analytics = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await analyticsService.getAnalytics();
      setData(typeof res.data === 'object' && res.data ? res.data : null);
    } catch (e) {
      console.error('Failed to load analytics:', e);
      setError(e.message || 'Backend unreachable');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const summary = data?.summary || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            Municipal Road Health Analytics
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            City-wide spatial and temporal trends derived from mobile public transport sensor telemetry
          </p>
        </div>

        <button onClick={fetchAnalytics} className="btn btn-secondary">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Refresh Metrics
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid-cols-4">
        <StatCard
          title="Total Road Hazards"
          value={summary.total_incidents || 0}
          icon={ShieldAlert}
          color="#38bdf8"
          subtitle="Identified across city network"
        />
        <StatCard
          title="Avg. Resolution Time"
          value={`${data?.avg_resolution_hours || 14.5} hrs`}
          icon={Clock}
          color="#10b981"
          subtitle="Municipal repair turnaround"
        />
        <StatCard
          title="Active Transit Routes"
          value={summary.monitored_routes || 2}
          icon={Compass}
          color="#8b5cf6"
          subtitle="Bus corridors surveyed"
        />
        <StatCard
          title="Detections Deduplicated"
          value={summary.total_detections_merged || 0}
          icon={TrendingUp}
          color="#f59e0b"
          subtitle="Clustered by ST-DBSCAN"
        />
      </div>

      {/* Row 1: Daily Trend & Severity Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.5rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            Incidents Detected Over Time (7-Day Trend)
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '1rem' }}>
            Daily detection volume across surveyed transit routes
          </span>

          <div style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trends || []}>
                <defs>
                  <linearGradient id="potholeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="crackGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                <Legend />
                <Area type="monotone" dataKey="potholes" stroke="#ef4444" fillOpacity={1} fill="url(#potholeGrad)" name="Potholes" />
                <Area type="monotone" dataKey="cracks" stroke="#0284c7" fillOpacity={1} fill="url(#crackGrad)" name="Cracks & Wear" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Severity Distribution */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            Severity Distribution
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '1rem' }}>
            Critical vs High vs Medium vs Low
          </span>

          <div style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.by_severity || []}>
                <XAxis dataKey="severity" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {(data?.by_severity || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Hazards by Route & Most Affected Pune Locations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
        {/* Hazards by Route */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            Hazards by Pune Public Bus Route
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '1rem' }}>
            Corridors requiring highest road resurfacing priority
          </span>

          <div style={{ height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={data?.by_route || []}>
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis dataKey="route_name" type="category" width={140} stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                <Bar dataKey="incident_count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Most Affected Locations Table */}
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
            Pune High-Density Defect Hotspots
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '1rem' }}>
            Top junctions flagged by bus camera sensors
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {(data?.hotspot_locations || []).map((spot, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MapPin size={15} color="#0284c7" />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>{spot.location}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 700 }}>
                    {spot.incidents} hazards
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      background: spot.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: spot.severity === 'CRITICAL' ? '#dc2626' : '#d97706',
                    }}
                  >
                    {spot.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
