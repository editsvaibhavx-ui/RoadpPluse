import React, { useState, useEffect } from 'react';
import { Eye, Filter, RefreshCw, Image as ImageIcon, MapPin, Maximize2 } from 'lucide-react';
import { detectionService, resolveMediaUrl } from '../services/api';

const Detections = () => {
  const [detections, setDetections] = useState([]);
  const [hazardFilter, setHazardFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState(null);

  const [error, setError] = useState(null);

  const fetchDetections = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await detectionService.getDetections({
        hazard_type: hazardFilter || undefined,
        limit: 100,
      });
      setDetections(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load detections:', err);
      setError(err.message || 'Backend unreachable');
      setDetections([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetections();
  }, [hazardFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            Raw AI Hazard Detection Feed
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Frame-level inference detections prior to ST-DBSCAN spatio-temporal clustering
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            value={hazardFilter}
            onChange={(e) => setHazardFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#0f172a',
              fontSize: '0.85rem',
            }}
          >
            <option value="">All Hazard Types</option>
            <option value="pothole">Potholes Only</option>
            <option value="road crack">Road Cracks</option>
            <option value="damaged road">Damaged Pavement</option>
          </select>

          <button onClick={fetchDetections} className="btn btn-secondary">
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Detections Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Detection ID</th>
                <th>Snapshot</th>
                <th>Hazard Type</th>
                <th>Confidence</th>
                <th>Video Frame / TS</th>
                <th>Estimated Size (Approx)</th>
                <th>Demo GPS Location</th>
                <th>Clustered Incident</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: '#991b1b', background: '#fef2f2' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.95rem' }}>
                      ⚠️ Backend Unreachable — Could not load raw detections
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
                      {error}
                    </div>
                    <button onClick={fetchDetections} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                      Retry Request
                    </button>
                  </td>
                </tr>
              ) : detections.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No raw detections available yet. Run the Demo Video or upload a new trip!
                  </td>
                </tr>
              ) : (
                detections.map((det) => (
                  <tr key={det.id}>
                    <td>
                      <span className="font-mono" style={{ color: '#0284c7', fontWeight: 600 }}>
                        DET-{det.id}
                      </span>
                    </td>
                    <td>
                      {det.image_path ? (
                        <div
                          style={{
                            width: '48px',
                            height: '36px',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: '1px solid #e2e8f0',
                            position: 'relative',
                          }}
                          onClick={() => setPreviewImage(resolveMediaUrl(det.image_path))}
                        >
                          <img
                            src={resolveMediaUrl(det.image_path)}
                            alt="Crop"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      ) : (
                        <div style={{ color: '#64748b' }}>
                          <ImageIcon size={18} />
                        </div>
                      )}
                    </td>
                    <td>
                      <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>
                        {det.hazard_type}
                      </strong>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: det.confidence >= 0.9 ? '#10b981' : det.confidence >= 0.8 ? '#0284c7' : '#d97706',
                        }}
                      >
                        {(det.confidence * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        Frame #{det.frame_number} &bull; +{det.timestamp_seconds}s
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 500 }}>
                        {det.estimated_width_m}m &times; {det.estimated_length_m}m &bull;{' '}
                        <strong>{det.estimated_area_m2} m²</strong>
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {det.latitude?.toFixed(4)}, {det.longitude?.toFixed(4)}
                      </span>
                    </td>
                    <td>
                      {det.incident_id ? (
                        <span className="badge badge-medium">INC-{det.incident_id}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Unclustered</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Snapshot Preview Modal */}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem',
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div style={{ maxWidth: '800px', width: '100%', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff', padding: '4px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' }}>
            <img src={previewImage} alt="Detection Preview" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '6px' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Detections;
