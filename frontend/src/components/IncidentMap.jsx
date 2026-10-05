import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SeverityBadge from './SeverityBadge';
import StatusBadge from './StatusBadge';
import { Link } from 'react-router-dom';

// Fix Leaflet default icon paths in React/Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom colored SVG pin generator
const createCustomMarkerIcon = (severity = 'MEDIUM') => {
  const sev = (severity || 'MEDIUM').toUpperCase();
  const colors = {
    CRITICAL: '#ef4444',
    HIGH: '#f59e0b',
    MEDIUM: '#3b82f6',
    LOW: '#10b981',
  };
  const pinColor = colors[sev] || '#64748b';
  const isCritical = sev === 'CRITICAL';

  const svgHtml = `
    <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
      ${
        isCritical
          ? `<div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(239, 68, 68, 0.4); animation: marker-pulse 1.8s infinite ease-in-out;"></div>`
          : ''
      }
      <svg width="28" height="34" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 30 12 30C12 30 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="${pinColor}"/>
        <circle cx="12" cy="11" r="5" fill="#ffffff"/>
      </svg>
    </div>
  `;

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: svgHtml,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });
};

const defaultPuneCenter = [18.5204, 73.8567]; // Pune center (FC Road / Deccan)

const IncidentMap = ({
  incidents = [],
  center = defaultPuneCenter,
  zoom = 13,
  height = '500px',
  routeWaypoints = [],
  selectedIncidentId = null,
}) => {
  return (
    <div style={{ height, width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Pune Route Polyline */}
        {routeWaypoints && routeWaypoints.length > 1 && (
          <Polyline
            positions={routeWaypoints.map((w) => [w.lat, w.lng])}
            pathOptions={{ color: '#0284c7', weight: 4, opacity: 0.8, dashArray: '6, 6' }}
          />
        )}

        {/* Incident Severity Markers */}
        {incidents.map((inc) => {
          if (!inc.latitude || !inc.longitude) return null;
          const isSelected = selectedIncidentId === inc.id;

          return (
            <Marker
              key={inc.id || inc.incident_code}
              position={[inc.latitude, inc.longitude]}
              icon={createCustomMarkerIcon(inc.severity)}
            >
              <Popup>
                <div style={{ padding: '0.4rem', minWidth: '220px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.9rem', color: '#0284c7' }}>{inc.incident_code}</strong>
                    <SeverityBadge severity={inc.severity} />
                  </div>

                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.3rem' }}>
                    {inc.hazard_type ? inc.hazard_type.toUpperCase() : 'ROAD HAZARD'}
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <div>Confidence: <strong style={{ color: '#0f172a' }}>{Math.round((inc.confidence || 0.9) * 100)}%</strong></div>
                    <div>Damage Size: <strong style={{ color: '#d97706' }}>{inc.estimated_area_m2 || 1.2} m²</strong> (Approx.)</div>
                    <div>Bus: <strong style={{ color: '#0284c7' }}>{inc.bus_id || 'BUS-001'}</strong></div>
                    <div>Location: <span>{inc.location_label || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`}</span></div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid #e2e8f0' }}>
                    <StatusBadge status={inc.status} />
                    <Link
                      to={`/incidents/${inc.id}`}
                      style={{
                        fontSize: '0.75rem',
                        color: '#0284c7',
                        textDecoration: 'underline',
                        fontWeight: 600,
                      }}
                    >
                      View Details &rarr;
                    </Link>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default IncidentMap;
