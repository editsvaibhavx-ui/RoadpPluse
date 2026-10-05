import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Navigation,
  Clock,
  Gauge,
  Layers,
  Download,
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  Compass,
  RefreshCw,
  GitMerge,
  Filter,
  Eye,
  Camera,
  Video
} from 'lucide-react';
import { sessionService } from '../services/api';
import ProcessingStepper from '../components/ProcessingStepper';
import RouteDefectsMap from '../components/RouteDefectsMap';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';

const SessionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [detections, setDetections] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('incidents'); // 'incidents' | 'detections'
  const [isExporting, setIsExporting] = useState(false);

  const fetchSessionData = async () => {
    try {
      const [sesRes, detsRes, incsRes] = await Promise.all([
        sessionService.getSession(id),
        sessionService.getSessionDetections(id),
        sessionService.getSessionIncidents(id)
      ]);
      setSession(sesRes.data);
      setDetections(detsRes.data || []);
      setIncidents(incsRes.data || []);
    } catch (err) {
      console.error('Error loading session detail:', err);
      setError(err.response?.data?.detail || 'Failed to load session from database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionData();
  }, [id]);

  // If session is still processing, poll every 2s
  useEffect(() => {
    if (!session || session.status === 'completed' || session.status === 'failed') return;
    const interval = setInterval(() => {
      fetchSessionData();
    }, 2000);
    return () => clearInterval(interval);
  }, [session]);

  if (isLoading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem auto' }} />
        Loading session details from database...
      </div>
    );
  }

  if (error || !session) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ padding: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5', marginBottom: '1.5rem' }}>
          <h3>Error</h3>
          <p>{error || 'Session not found.'}</p>
        </div>
        <Link to="/sessions" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Back to Sessions
        </Link>
      </div>
    );
  }

  // Calculate telemetry numbers directly from real DB records
  const totalDistM = session.distance_m || 0;
  const totalDistKm = (totalDistM / 1000).toFixed(3);
  const durationS = session.video_duration_s || 0;
  const avgSpeedKmh = session.avg_speed_kmh || (durationS > 0 && totalDistM > 0 ? ((totalDistM / durationS) * 3.6).toFixed(1) : 0);

  const potholes = detections.filter(d => (d.class || d.hazard_type || '').toLowerCase().includes('pothole'));
  const cracks = detections.filter(d => (d.class || d.hazard_type || '').toLowerCase().includes('crack'));
  const defectsPerKm = totalDistM > 0 ? ((incidents.length / (totalDistM / 1000))).toFixed(1) : '0.0';

  // Map pipeline steps for stepper
  const stepMap = {};
  let curStep = 5;
  if (session.pipeline_steps) {
    session.pipeline_steps.forEach(s => {
      stepMap[s.step_no] = s.status;
      if (s.status === 'running') curStep = s.step_no;
    });
  }

  // Export handlers
  const handleExport = (format) => {
    window.open(sessionService.getExportUrl(session.id, format), '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/sessions" className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }}>
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                Session: {session.id}
              </h1>
              <span
                style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: session.status === 'completed' ? '#dcfce7' : '#fef3c7',
                  color: session.status === 'completed' ? '#059669' : '#d97706',
                }}
              >
                {session.status.toUpperCase()}
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem' }}>
              Source: <strong style={{ color: '#0f172a' }}>{session.source.toUpperCase()}</strong> &bull; Created: {new Date(session.created_at).toLocaleString()}
              {session.video_filename && ` \u2022 Video: ${session.video_filename}`}
            </p>
          </div>
        </div>

        {/* Export Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => handleExport('json')} className="btn btn-secondary" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <Download size={14} /> JSON
          </button>
          <button onClick={() => handleExport('csv')} className="btn btn-secondary" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <FileSpreadsheet size={14} /> CSV
          </button>
          <button onClick={() => handleExport('geojson')} className="btn btn-primary" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <Compass size={14} /> GeoJSON
          </button>
        </div>
      </div>

      {/* 5-STEP PIPELINE STATUS */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
          Relational Database Pipeline Execution Status (Steps 1 - 5)
        </h3>
        <ProcessingStepper currentStep={curStep} stepStatusMap={stepMap} />
      </div>

      {/* TELEMETRY STATS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Navigation size={13} color="#0284c7" /> Distance (m / km)
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginTop: '0.3rem' }}>
            {Math.round(totalDistM)} m
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            {totalDistKm} km ({session.distance_source || 'Track'})
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Clock size={13} color="#8b5cf6" /> Duration
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginTop: '0.3rem' }}>
            {Math.round(durationS)} s
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Elapsed video time
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Gauge size={13} color="#059669" /> Avg Speed
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginTop: '0.3rem' }}>
            {avgSpeedKmh}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            km/h vehicle speed
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <AlertTriangle size={13} color="#ef4444" /> Potholes
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444', marginTop: '0.3rem' }}>
            {potholes.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Raw CV detections
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <AlertTriangle size={13} color="#d97706" /> Road Cracks
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#d97706', marginTop: '0.3rem' }}>
            {cracks.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Raw edge detections
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <GitMerge size={13} color="#7c3aed" /> Incidents
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.3rem' }}>
            {incidents.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            ST-DBSCAN merged
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Layers size={13} color="#0284c7" /> Defects / km
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0284c7', marginTop: '0.3rem' }}>
            {defectsPerKm}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Road density index
          </div>
        </div>
      </div>

      {/* MAP VIEW */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
          Geospatial Road Defect Map with Chainage
        </h3>
        <RouteDefectsMap
          incidents={incidents}
          detections={detections}
          height="420px"
        />
      </div>

      {/* TABBED TABLES: INCIDENTS VS RAW DETECTIONS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0.5rem 1rem', background: '#f8fafc' }}>
          <button
            onClick={() => setActiveTab('incidents')}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'incidents' ? '2px solid #0284c7' : 'none',
              color: activeTab === 'incidents' ? '#0284c7' : '#64748b',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <GitMerge size={15} /> ST-DBSCAN Incidents ({incidents.length})
          </button>
          <button
            onClick={() => setActiveTab('detections')}
            style={{
              padding: '0.6rem 1.2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'detections' ? '2px solid #0284c7' : 'none',
              color: activeTab === 'detections' ? '#0284c7' : '#64748b',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <Eye size={15} /> Raw Frame Detections ({detections.length})
          </button>
        </div>

        {activeTab === 'incidents' ? (
          /* INCIDENTS TABLE */
          incidents.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <CheckCircle size={32} color="#10b981" style={{ margin: '0 auto 0.75rem auto' }} />
              <h4 style={{ color: '#0f172a', fontWeight: 700 }}>No hazards detected</h4>
              <p style={{ fontSize: '0.85rem' }}>No potholes or road cracks were found on this route segment. Surface quality is normal.</p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Class</th>
                    <th>Severity</th>
                    <th>Confidence</th>
                    <th>Chainage</th>
                    <th>Coordinates</th>
                    <th>Observations</th>
                    <th>Dimensions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc) => (
                    <tr key={inc.id}>
                      <td style={{ fontWeight: 700, color: '#0284c7' }}>
                        {inc.incident_code}
                      </td>
                      <td>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#0f172a' }}>
                          {inc.class}
                        </span>
                      </td>
                      <td>
                        <SeverityBadge severity={inc.severity} />
                      </td>
                      <td>
                        <span style={{ fontWeight: 700 }}>
                          {Math.round((inc.max_confidence || 0) * 100)}%
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: '#0284c7' }}>
                        {inc.chainageLabel || `${Math.round(inc.chainage_m)} m`}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {inc.centroid_lat?.toFixed(5)}, {inc.centroid_lon?.toFixed(5)}
                      </td>
                      <td>
                        <span style={{ padding: '0.2rem 0.5rem', background: '#f1f5f9', color: '#0f172a', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {inc.detection_count} frame{inc.detection_count > 1 ? 's' : ''}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                        {inc.avg_width_cm ? `${inc.avg_width_cm} \u00D7 ${inc.avg_length_cm} cm` : '-'}
                      </td>
                      <td>
                        <StatusBadge status={inc.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* DETECTIONS TABLE */
          detections.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
              <CheckCircle size={32} color="#10b981" style={{ margin: '0 auto 0.75rem auto' }} />
              <h4 style={{ color: '#0f172a', fontWeight: 700 }}>No raw detections</h4>
              <p style={{ fontSize: '0.85rem' }}>Zero frame-level defects were triggered during the computer vision scan.</p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Frame #</th>
                    <th>Time Offset</th>
                    <th>Class</th>
                    <th>Confidence</th>
                    <th>Bounding Box [x, y, w, h]</th>
                    <th>Chainage</th>
                    <th>GPS Coordinates</th>
                    <th>Dimensions</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.map((det) => (
                    <tr key={det.id}>
                      <td style={{ fontWeight: 700, color: '#64748b' }}>
                        #{det.frame_index}
                      </td>
                      <td>
                        {det.video_offset_s?.toFixed(2)}s
                      </td>
                      <td>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#0f172a' }}>
                          {det.class}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#059669' }}>
                          {Math.round((det.confidence || 0) * 100)}%
                        </span>
                      </td>
                      <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b' }}>
                        [{Math.round(det.bbox_x)}, {Math.round(det.bbox_y)}, {Math.round(det.bbox_w)}, {Math.round(det.bbox_h)}]
                      </td>
                      <td style={{ fontWeight: 600, color: '#0284c7' }}>
                        {det.chainageLabel || `${Math.round(det.chainage_m)} m`}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {det.lat?.toFixed(5)}, {det.lon?.toFixed(5)}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#475569' }}>
                        {det.width_cm} \u00D7 {det.length_cm} cm
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default SessionDetail;
