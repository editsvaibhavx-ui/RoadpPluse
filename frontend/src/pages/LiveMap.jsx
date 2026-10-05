import React, { useState, useEffect } from 'react';
import { Filter, Layers, RefreshCw, Bus, Compass } from 'lucide-react';
import { incidentService, routeService, busService } from '../services/api';
import IncidentMap from '../components/IncidentMap';

const LiveMap = () => {
  const [incidents, setIncidents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [buses, setBuses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [hazardFilter, setHazardFilter] = useState('');
  const [busFilter, setBusFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [incRes, routeRes, busRes] = await Promise.all([
        incidentService.getIncidents({
          severity: severityFilter || undefined,
          status: statusFilter || undefined,
          hazard_type: hazardFilter || undefined,
          bus_id: busFilter || undefined,
          route_id: routeFilter ? parseInt(routeFilter) : undefined,
        }),
        routeService.getRoutes().catch(() => ({ data: [] })),
        busService.getBuses().catch(() => ({ data: [] })),
      ]);
      setIncidents(Array.isArray(incRes?.data) ? incRes.data : []);
      setRoutes(Array.isArray(routeRes?.data) ? routeRes.data : []);
      setBuses(Array.isArray(busRes?.data) ? busRes.data : []);
    } catch (e) {
      console.error('Failed to load map data:', e);
      setIncidents([]);
      setRoutes([]);
      setBuses([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [severityFilter, statusFilter, hazardFilter, busFilter, routeFilter]);

  const safeRoutes = Array.isArray(routes) ? routes : [];
  const activeRoute = safeRoutes.find((r) => r.route_code === 'PUNE-RT-01' || r.route_code === 'PUNE-R01');
  let waypoints = [];
  try {
    if (activeRoute?.waypoints_json) {
      waypoints = typeof activeRoute.waypoints_json === 'string' ? JSON.parse(activeRoute.waypoints_json) : activeRoute.waypoints_json;
    }
  } catch {
    waypoints = [];
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            Live GIS Incident & Transit Map
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Real-time geospatial intelligence mapped over Pune road infrastructure (OpenStreetMap)
          </p>
        </div>

        <button onClick={fetchData} className="btn btn-secondary">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Refresh Map
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '0.85rem 1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Filter size={15} /> Filters:
        </span>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.8rem' }}
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical Severity (Red Pulse)</option>
          <option value="HIGH">High Severity (Amber)</option>
          <option value="MEDIUM">Medium Severity (Blue)</option>
          <option value="LOW">Low Severity (Green)</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.8rem' }}
        >
          <option value="">All Statuses</option>
          <option value="NEW">New</option>
          <option value="VERIFIED">Verified</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
        </select>

        <select
          value={hazardFilter}
          onChange={(e) => setHazardFilter(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.8rem' }}
        >
          <option value="">All Hazards</option>
          <option value="pothole">Potholes</option>
          <option value="road crack">Road Cracks</option>
          <option value="damaged road">Damaged Pavement</option>
        </select>

        <select
          value={busFilter}
          onChange={(e) => setBusFilter(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a', fontSize: '0.8rem' }}
        >
          <option value="">All Buses</option>
          {Array.isArray(buses) && buses.map((b) => (
            <option key={b.id} value={b.bus_number}>
              {b.bus_number}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: '#475569' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} /> Critical
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} /> High
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} /> Medium
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> Low
          </span>
        </div>
      </div>

      {/* Main Map Frame */}
      <div className="card" style={{ padding: '0.5rem', height: '700px' }}>
        <IncidentMap
          incidents={incidents}
          routeWaypoints={waypoints}
          height="100%"
          zoom={13}
        />
      </div>
    </div>
  );
};

export default LiveMap;
