import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom SVG Icons
const createHazardIcon = (type = 'pothole', chainageLabel = '') => {
  const isCrack = (type || '').toLowerCase().includes('crack');
  const color = isCrack ? '#f59e0b' : '#ef4444'; // Amber for crack, Crimson for pothole
  const glyph = isCrack ? '⚡' : '⬤';

  const html = `
    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: ${color}26; border: 2px solid ${color};"></div>
      <div style="width: 18px; height: 18px; border-radius: 50%; background: ${color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">
        ${glyph}
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'hazard-marker-icon',
    html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

const createTerminalIcon = (label = 'START', isStart = true) => {
  const color = isStart ? '#10b981' : '#f43f5e';
  const html = `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="background: ${color}; color: #fff; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); white-space: nowrap;">
        ${label}
      </div>
      <div style="width: 2px; height: 10px; background: ${color};"></div>
      <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; border: 2px solid #fff;"></div>
    </div>
  `;

  return L.divIcon({
    className: 'terminal-marker-icon',
    html,
    iconSize: [50, 36],
    iconAnchor: [25, 36],
    popupAnchor: [0, -36],
  });
};

// Map click handler for picking start/end points
const MapClickHandler = ({ pickingMode, onPickPoint }) => {
  useMapEvents({
    click(e) {
      if (pickingMode && onPickPoint) {
        onPickPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
};

// Auto-fitter to bounds
const FitBoundsEffect = ({ coordinates, defects }) => {
  const map = useMap();

  useEffect(() => {
    const allPoints = [];
    if (coordinates && coordinates.length > 0) {
      coordinates.forEach((p) => allPoints.push([p.lat ?? p.latitude, p.lng ?? p.lon ?? p.longitude]));
    }
    if (defects && defects.length > 0) {
      defects.forEach((d) => {
        const lat = d.lat ?? d.latitude;
        const lng = d.lng ?? d.longitude;
        if (lat && lng) allPoints.push([lat, lng]);
      });
    }

    if (allPoints.length > 1) {
      try {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } catch (err) {
        // bounds fit
      }
    } else if (allPoints.length === 1) {
      map.setView(allPoints[0], 14);
    }
  }, [coordinates, defects, map]);

  return null;
};

const RouteDefectsMap = ({
  routeCoordinates = [],
  defects = [],
  startPoint = null,
  endPoint = null,
  pickingMode = null, // null | 'start' | 'end'
  onPickPoint = null,
  height = '420px',
  center = [18.5204, 73.8567],
  zoom = 13,
}) => {
  const polylinePositions = (routeCoordinates || []).map((p) => [p.lat ?? p.latitude, p.lng ?? p.lon ?? p.longitude]);

  return (
    <div style={{ position: 'relative', height, width: '100%', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      {pickingMode && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 50,
            zIndex: 1000,
            background: '#ffffff',
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid #0284c7',
            color: '#0284c7',
            fontSize: '0.8rem',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            pointerEvents: 'none',
          }}
        >
          📍 Tap map to set {pickingMode.toUpperCase()} point
        </div>
      )}

      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler pickingMode={pickingMode} onPickPoint={onPickPoint} />
        <FitBoundsEffect coordinates={routeCoordinates} defects={defects} />

        {/* Route Casing & Center Polyline */}
        {polylinePositions.length > 1 && (
          <>
            <Polyline positions={polylinePositions} pathOptions={{ color: '#0f172a', weight: 8, opacity: 0.7 }} />
            <Polyline positions={polylinePositions} pathOptions={{ color: '#06b6d4', weight: 4, opacity: 0.95 }} />
          </>
        )}

        {/* Start Point Marker */}
        {startPoint && (
          <Marker position={[startPoint.lat, startPoint.lng]} icon={createTerminalIcon('START (0 m)', true)}>
            <Popup>
              <div style={{ fontSize: '0.8rem' }}>
                <strong style={{ color: '#10b981' }}>Route Origin (START)</strong>
                <div>Chainage: 0 m</div>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                  {startPoint.lat.toFixed(5)}, {startPoint.lng.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* End Point Marker */}
        {endPoint && (
          <Marker position={[endPoint.lat, endPoint.lng]} icon={createTerminalIcon('END', false)}>
            <Popup>
              <div style={{ fontSize: '0.8rem' }}>
                <strong style={{ color: '#f43f5e' }}>Route Destination (END)</strong>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                  {endPoint.lat.toFixed(5)}, {endPoint.lng.toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Defect Markers with Chainage & Type */}
        {defects.map((d, idx) => {
          const lat = d.lat ?? d.latitude;
          const lng = d.lng ?? d.longitude;
          if (!lat || !lng) return null;

          const isCrack = (d.hazard_type || d.type || '').toLowerCase().includes('crack');
          const typeLabel = isCrack ? 'Road Crack' : 'Pothole';
          const chainageTxt = d.chainageLabel || (d.chainageMeters !== undefined ? `${d.chainageMeters} m` : 'N/A');

          return (
            <Marker key={d.id || idx} position={[lat, lng]} icon={createHazardIcon(d.hazard_type || d.type, chainageTxt)}>
              <Popup>
                <div style={{ minWidth: '180px', padding: '2px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong style={{ color: isCrack ? '#f59e0b' : '#ef4444' }}>{typeLabel.toUpperCase()}</strong>
                    <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem', color: '#475569' }}>
                      {d.confidence ? `${Math.round(d.confidence > 1 ? d.confidence : d.confidence * 100)}%` : '92%'}
                    </span>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', margin: '4px 0', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Chainage:</span>
                      <strong style={{ color: '#0284c7' }}>{chainageTxt}</strong>
                    </div>
                    {d.timestamp_seconds !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Time:</span>
                        <span style={{ color: '#0f172a' }}>{d.timestamp_seconds}s</span>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    GPS: {lat.toFixed(5)}, {lng.toFixed(5)}
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

export default RouteDefectsMap;
