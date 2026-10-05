import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Shield,
  Layers,
  MapPin,
  Maximize2,
  Calendar,
  Ruler,
  Info,
} from 'lucide-react';
import { incidentService, resolveMediaUrl } from '../services/api';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';
import IncidentMap from '../components/IncidentMap';

const IncidentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Workflow actions
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [assignee, setAssignee] = useState('Rajesh Deshmukh (Lead Engineer)');
  const [team, setTeam] = useState('Shivajinagar Road Repair Squad');
  const [notes, setNotes] = useState('Bitumen patch repair completed');

  const fetchDetail = async () => {
    setIsLoading(true);
    try {
      const res = await incidentService.getIncidentDetail(id);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  if (isLoading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading incident telemetry...</div>;
  }

  if (!data?.incident) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', margin: '2rem auto' }}>
        <h3 style={{ color: '#0f172a', marginBottom: '0.5rem', fontWeight: 700 }}>
          Incident Not Found or Backend Unreachable
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Could not retrieve incident telemetry. Verify that the backend service is running and accessible.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={fetchDetail} className="btn btn-secondary">
            Retry Connection
          </button>
          <Link to="/incidents" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            &larr; Back to Incidents
          </Link>
        </div>
      </div>
    );
  }

  const { incident, severity_reasons = [], detections = [], assignments = [] } = data;

  const handleVerify = async () => {
    try {
      await incidentService.verifyIncident(incident.id, {
        verified_by: 'Municipal Authority Officer',
      });
      fetchDetail();
    } catch (e) {
      alert('Error verifying incident');
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    try {
      await incidentService.assignIncident(incident.id, {
        assigned_to: assignee,
        assigned_team: team,
      });
      setIsAssigning(false);
      fetchDetail();
    } catch (e) {
      alert('Error assigning incident');
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    try {
      await incidentService.resolveIncident(incident.id, {
        resolution_notes: notes,
      });
      setIsResolving(false);
      fetchDetail();
    } catch (e) {
      alert('Error resolving incident');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header & Breadcrumb */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/incidents')} className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem' }}>
            <ArrowLeft size={16} /> Back to Incidents
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
                {incident.incident_code}
              </h1>
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {incident.location_label || `Pune Coordinates (${incident.latitude}, ${incident.longitude})`} &bull; Bus: {incident.bus_id}
            </p>
          </div>
        </div>

        {/* Workflow Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {incident.status === 'NEW' && (
            <button onClick={handleVerify} className="btn btn-primary" style={{ background: '#7c3aed' }}>
              <CheckCircle size={16} /> Verify Incident
            </button>
          )}

          {incident.status === 'VERIFIED' && (
            <button onClick={() => setIsAssigning(true)} className="btn btn-primary" style={{ background: '#d97706' }}>
              <User size={16} /> Assign Repair Squad
            </button>
          )}

          {(incident.status === 'ASSIGNED' || incident.status === 'IN_PROGRESS') && (
            <button onClick={() => setIsResolving(true)} className="btn btn-primary" style={{ background: '#059669' }}>
              <CheckCircle size={16} /> Mark Resolved
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Left Visual & AI telemetry, Right Metrics & Map */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
        {/* Left Column: Frame Snapshot & ST-DBSCAN explanation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Annotated Frame Card */}
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
              Representative Road Camera Frame
            </h3>
            <div
              style={{
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                position: 'relative',
              }}
            >
              {incident.image_url ? (
                <img
                  src={resolveMediaUrl(incident.image_url)}
                  alt="Hazard Snapshot"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  No frame preview available
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
              <span>Camera Source: <strong style={{ color: '#0284c7' }}>Smartphone Camera Dash Mount</strong></span>
              <span>Inference Confidence: <strong style={{ color: '#059669' }}>{Math.round(incident.confidence * 100)}%</strong></span>
            </div>
          </div>

          {/* Transparent Severity Scoring Explanation */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Shield size={18} color="#d97706" />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                Severity Assessment Rationale (Transparent Algorithm)
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
              Severity tier (<strong>{incident.severity}</strong>) is computed deterministically from defect area, repeated observations, AI confidence, and hazard impact:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {severity_reasons.map((reason, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.8rem',
                    color: '#334155',
                  }}
                >
                  <span style={{ color: '#0284c7' }}>&bull;</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ST-DBSCAN Deduplication Card */}
          <div className="card" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Layers size={18} color="#0284c7" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0369a1' }}>
                ST-DBSCAN Spatio-Temporal Deduplication
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#334155', lineHeight: '1.5' }}>
              {incident.deduplication_note || `${incident.detection_count} raw frame detections combined into this single physical incident.`}
            </p>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.4rem' }}>
              Algorithm parameters: Distance threshold &le; 18 meters &bull; Temporal window &le; 45 seconds.
            </div>
          </div>
        </div>

        {/* Right Column: Damage Measurements & Mini Map & Audit Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Estimated Damage Size Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Ruler size={18} color="#d97706" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                  Estimated Damage Size
                </h3>
              </div>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                }}
              >
                APPROXIMATE PROTOTYPE ESTIMATE
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Width</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  {incident.estimated_width_m || 1.1} m
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Length</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  {incident.estimated_length_m || 0.9} m
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Est. Area</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>
                  {incident.estimated_area_m2 || 1.0} m²
                </div>
              </div>
            </div>

            <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: '0.75rem' }}>
              * Calculated using dashcam bounding box homography scale factor. Not intended for survey-grade precision.
            </span>
          </div>

          {/* Location Map */}
          <div className="card" style={{ padding: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
              GPS Location (Pune Transit Network)
            </h3>
            <IncidentMap
              incidents={[incident]}
              center={[incident.latitude, incident.longitude]}
              zoom={15}
              height="260px"
              selectedIncidentId={incident.id}
            />
            <div style={{ fontSize: '0.72rem', color: '#64748b', padding: '0.4rem 0.5rem 0' }}>
              Demo GPS Location: <strong>{incident.latitude.toFixed(6)}° N, {incident.longitude.toFixed(6)}° E</strong>
            </div>
          </div>

          {/* Audit & Workflow Status */}
          <div className="card">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
              Municipal Workflow Timeline
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Detected Timestamp:</span>
                <span style={{ color: '#0f172a' }}>{new Date(incident.detected_at).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Verified Status:</span>
                <span style={{ color: incident.verified_by ? '#059669' : '#64748b', fontWeight: incident.verified_by ? 600 : 400 }}>
                  {incident.verified_by ? `Verified by ${incident.verified_by}` : 'Pending Verification'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Assigned Maintenance Team:</span>
                <span style={{ color: '#0284c7', fontWeight: 600 }}>{incident.assigned_team || 'Unassigned'}</span>
              </div>
              {incident.assigned_to && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.4rem' }}>
                  <span style={{ color: '#64748b' }}>Assigned Engineer:</span>
                  <span style={{ color: '#0f172a' }}>{incident.assigned_to}</span>
                </div>
              )}
              {incident.resolution_notes && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#059669', fontWeight: 600 }}>Resolution Summary:</span>
                  <span style={{ color: '#334155' }}>{incident.resolution_notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assign Modal */}
      {isAssigning && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              Assign Incident {incident.incident_code}
            </h3>
            <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem' }}>
                  Select Maintenance Team:
                </label>
                <select
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                >
                  <option value="Shivajinagar Road Repair Squad">Shivajinagar Road Repair Squad</option>
                  <option value="Central Zone Road Maintenance">Central Zone Road Maintenance</option>
                  <option value="Swargate Rapid Asphalt Division">Swargate Rapid Asphalt Division</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem' }}>
                  Assignee Engineer:
                </label>
                <input
                  type="text"
                  required
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setIsAssigning(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {isResolving && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              Mark Resolved: {incident.incident_code}
            </h3>
            <form onSubmit={handleResolve} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem' }}>
                  Resolution Notes & Work Completed:
                </label>
                <textarea
                  rows="3"
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setIsResolving(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: '#059669' }}>
                  Confirm Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentDetails;
