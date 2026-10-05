import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, AlertTriangle, CheckCircle, Settings, Compass } from 'lucide-react';
import RouteDefectsMap from './RouteDefectsMap';

export const LocationPermissionPrompt = ({
  locationState, // 'prompt' | 'granted' | 'denied' | 'unavailable' | 'timeout'
  coords, // { lat, lng, accuracy }
  onRequestPermission,
  onManualLocationSelect,
  showModal = false,
  onCloseModal,
}) => {
  const [manualLat, setManualLat] = useState(coords?.lat || 18.5204);
  const [manualLng, setManualLng] = useState(coords?.lng || 73.8567);
  const [showManualPicker, setShowManualPicker] = useState(false);

  // If in prompt state, render in-app permission banner or modal
  if (locationState === 'prompt' || showModal) {
    return (
      <div
        style={{
          background: '#f0f9ff',
          border: '2px solid #38bdf8',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: '0 4px 14px rgba(2, 132, 199, 0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: '#0284c7',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Navigation size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Allow Location Access to Tag Hazards with GPS
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#475569', margin: '0.2rem 0 0 0' }}>
                Required to record vehicle distance, measure chainage, and place detected potholes and cracks along the transit route.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onRequestPermission}
            className="btn btn-primary"
            style={{ padding: '0.55rem 1.25rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Navigation size={16} /> Enable Browser GPS Access
          </button>
          <button
            type="button"
            onClick={() => setShowManualPicker(!showManualPicker)}
            className="btn btn-secondary"
            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
          >
            {showManualPicker ? 'Hide Manual Entry' : 'Manual Location Fallback'}
          </button>
        </div>

        {/* Manual Fallback Map Picker */}
        {showManualPicker && (
          <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                Pick Starting Point on Map or Enter Lat / Lon:
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Tap map to reposition
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={manualLat}
                  onChange={(e) => setManualLat(parseFloat(e.target.value))}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#0f172a', fontSize: '0.8rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={manualLng}
                  onChange={(e) => setManualLng(parseFloat(e.target.value))}
                  style={{ width: '100%', padding: '0.35rem 0.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#0f172a', fontSize: '0.8rem' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    onManualLocationSelect({ lat: manualLat, lng: manualLng, accuracy: 5.0 });
                    setShowManualPicker(false);
                  }}
                  className="btn btn-primary"
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                >
                  Confirm Coordinates
                </button>
              </div>
            </div>

            <div style={{ height: '180px', borderRadius: '6px', overflow: 'hidden' }}>
              <RouteDefectsMap
                routeCoordinates={[{ lat: manualLat, lng: manualLng }]}
                startPoint={{ lat: manualLat, lng: manualLng }}
                pickingMode="start"
                onPickPoint={(pt) => {
                  setManualLat(pt.lat);
                  setManualLng(pt.lng);
                  onManualLocationSelect({ lat: pt.lat, lng: pt.lng, accuracy: 5.0 });
                }}
                height="180px"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // If permission denied, show re-enable instructions and manual fallback
  if (locationState === 'denied') {
    return (
      <div
        style={{
          background: '#fee2e2',
          border: '1px solid #f87171',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b91c1c' }}>
          <AlertTriangle size={20} />
          <strong style={{ fontSize: '0.9rem' }}>Location Access Denied</strong>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.4' }}>
          To enable GPS location in your browser:
          <ol style={{ margin: '0.4rem 0 0 1.25rem', padding: 0 }}>
            <li>Click the <strong>Tune / Lock icon</strong> next to the URL in your browser's address bar.</li>
            <li>Toggle <strong>Location</strong> to <strong>Allow</strong>.</li>
            <li>Reload the page or click "Retry GPS" below.</li>
          </ol>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onRequestPermission}
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
          >
            Retry GPS Permission
          </button>
          <button
            type="button"
            onClick={() => setShowManualPicker(!showManualPicker)}
            className="btn btn-primary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
          >
            Use Manual Map Fallback
          </button>
        </div>

        {showManualPicker && (
          <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <input
                type="number"
                step="0.0001"
                placeholder="Lat"
                value={manualLat}
                onChange={(e) => setManualLat(parseFloat(e.target.value))}
                style={{ padding: '0.3rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#0f172a', fontSize: '0.75rem' }}
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Lon"
                value={manualLng}
                onChange={(e) => setManualLng(parseFloat(e.target.value))}
                style={{ padding: '0.3rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#0f172a', fontSize: '0.75rem' }}
              />
              <button
                type="button"
                onClick={() => {
                  onManualLocationSelect({ lat: manualLat, lng: manualLng, accuracy: 5.0 });
                  setShowManualPicker(false);
                }}
                className="btn btn-primary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              >
                Set
              </button>
            </div>
            <div style={{ height: '160px', borderRadius: '6px', overflow: 'hidden' }}>
              <RouteDefectsMap
                startPoint={{ lat: manualLat, lng: manualLng }}
                pickingMode="start"
                onPickPoint={(pt) => {
                  setManualLat(pt.lat);
                  setManualLng(pt.lng);
                  onManualLocationSelect({ lat: pt.lat, lng: pt.lng, accuracy: 5.0 });
                }}
                height="160px"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // If granted, display a clean status badge with coordinates and accuracy
  if (locationState === 'granted' && coords) {
    return (
      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '8px',
          padding: '0.5rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={16} color="#059669" />
          <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 700 }}>
            GPS Location Active:
          </span>
          <span style={{ fontSize: '0.8rem', color: '#0f172a', fontFamily: 'monospace', fontWeight: 600 }}>
            {coords.lat.toFixed(5)}&deg; N, {coords.lng.toFixed(5)}&deg; E
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem', color: '#64748b' }}>
          <span>Accuracy: <strong style={{ color: '#0284c7' }}>&plusmn;{Math.round(coords.accuracy || 5)}m</strong></span>
          <button
            type="button"
            onClick={() => setShowManualPicker(!showManualPicker)}
            style={{ background: 'none', border: 'none', color: '#0284c7', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.7rem' }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return null;
};
