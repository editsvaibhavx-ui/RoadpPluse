import React, { useState, useEffect } from 'react';
import { Route as RouteIcon, MapPin, Compass, Plus } from 'lucide-react';
import { routeService } from '../services/api';

const AdminRoutes = () => {
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    routeService
      .getRoutes()
      .then((r) => setRoutes(Array.isArray(r.data) ? r.data : []))
      .catch((e) => {
        console.error('Failed to load routes:', e);
        setError(e.message || 'Backend unreachable');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const safeRoutes = Array.isArray(routes) ? routes : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
          Pune Transit Corridors & Waypoints
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
          Defined public transport bus routes used for geo-temporal trajectory correlation
        </p>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c' }}>
          ⚠️ Backend connection failed: {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {safeRoutes.length === 0 && !isLoading && !error && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            No transit routes configured yet.
          </div>
        )}
        {safeRoutes.map((rt) => {
          let waypoints = [];
          try {
            waypoints = rt.waypoints_json ? (typeof rt.waypoints_json === 'string' ? JSON.parse(rt.waypoints_json) : rt.waypoints_json) : [];
          } catch {
            waypoints = [];
          }
          return (
            <div key={rt.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                    <RouteIcon size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{rt.route_name}</h3>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Code: {rt.route_code} &bull; {waypoints.length} Survey Waypoints</span>
                  </div>
                </div>

                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, background: '#dcfce7', color: '#166534' }}>
                  ACTIVE SURVEY
                </span>
              </div>

              {/* Waypoints Flow */}
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginBottom: '0.5rem' }}>
                  TRANSIT CORRIDOR STOPS & GPS NODES:
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {waypoints.map((wp, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '6px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <MapPin size={12} color="#0284c7" />
                      <span style={{ color: '#0f172a', fontWeight: 600 }}>{wp.name}</span>
                      <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                        ({wp.lat}, {wp.lng})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminRoutes;
