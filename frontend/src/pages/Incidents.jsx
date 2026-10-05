import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Filter,
  CheckCircle,
  UserCheck,
  CheckSquare,
  RefreshCw,
  ExternalLink,
  Search,
} from 'lucide-react';
import { incidentService } from '../services/api';
import SeverityBadge from '../components/SeverityBadge';
import StatusBadge from '../components/StatusBadge';

const Incidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Quick Action Modal state
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [actionType, setActionType] = useState(null); // 'verify' | 'assign' | 'resolve'
  const [assignedTo, setAssignedTo] = useState('Rajesh Deshmukh (Lead Engineer)');
  const [assignedTeam, setAssignedTeam] = useState('Shivajinagar Road Repair Squad');
  const [resolutionNotes, setResolutionNotes] = useState('Bitumen patch repair completed');

  const [error, setError] = useState(null);

  const fetchIncidents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await incidentService.getIncidents({
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
      });
      setIncidents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
      setError(err.message || 'Backend unreachable');
      setIncidents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [severityFilter, statusFilter]);

  const handleVerify = async (inc) => {
    try {
      await incidentService.verifyIncident(inc.id, {
        verified_by: 'Municipal Authority Officer',
        notes: 'Hazard confirmed from dashcam frame review',
      });
      fetchIncidents();
    } catch (err) {
      alert('Failed to verify incident: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    try {
      await incidentService.assignIncident(selectedIncident.id, {
        assigned_to: assignedTo,
        assigned_team: assignedTeam,
      });
      setSelectedIncident(null);
      setActionType(null);
      fetchIncidents();
    } catch (err) {
      alert('Failed to assign incident: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    try {
      await incidentService.resolveIncident(selectedIncident.id, {
        resolution_notes: resolutionNotes,
      });
      setSelectedIncident(null);
      setActionType(null);
      fetchIncidents();
    } catch (err) {
      alert('Failed to mark resolved: ' + (err.response?.data?.detail || err.message));
    }
  };

  const safeList = Array.isArray(incidents) ? incidents : [];
  const filteredIncidents = safeList.filter((i) => {
    if (!i) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (i.incident_code && i.incident_code.toLowerCase().includes(q)) ||
      (i.hazard_type && i.hazard_type.toLowerCase().includes(q)) ||
      (i.location_label && i.location_label.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1f5f9' }}>
            Municipal Incident Management
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Triaged road surface hazards consolidated from public bus camera feeds via ST-DBSCAN
          </p>
        </div>

        <button onClick={fetchIncidents} className="btn btn-secondary">
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search by code, hazard, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 1rem 0.5rem 2.2rem',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#0f172a',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#0f172a',
              fontSize: '0.85rem',
            }}
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              color: '#0f172a',
              fontSize: '0.85rem',
            }}
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="VERIFIED">Verified</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Incident Code</th>
                <th>Hazard</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Damage Area (Approx)</th>
                <th>Bus / Route</th>
                <th>Location</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: '#991b1b', background: '#fef2f2' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.95rem' }}>
                      ⚠️ Backend Unreachable — Could not load incidents
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
                      {error}
                    </div>
                    <button onClick={fetchIncidents} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                      Retry Request
                    </button>
                  </td>
                </tr>
              ) : filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No matching incidents found.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((inc) => (
                  <tr key={inc.id}>
                    <td>
                      <Link
                        to={`/incidents/${inc.id}`}
                        style={{ color: '#38bdf8', fontWeight: 700, textDecoration: 'none' }}
                      >
                        {inc.incident_code}
                      </Link>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {inc.detection_count > 1 ? `${inc.detection_count} merged observations` : 'Single detection'}
                      </div>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#f1f5f9' }}>
                        {inc.hazard_type}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Conf: {(inc.confidence * 100).toFixed(1)}%
                      </div>
                    </td>
                    <td>
                      <SeverityBadge severity={inc.severity} />
                    </td>
                    <td>
                      <StatusBadge status={inc.status} />
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#fde047' }}>
                        {inc.estimated_area_m2} m²
                      </span>
                    </td>
                    <td>
                      <span style={{ color: '#93c5fd', fontSize: '0.8rem' }}>{inc.bus_id}</span>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Pune Rt 01</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                        {inc.location_label || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {inc.status === 'NEW' && (
                          <button
                            onClick={() => handleVerify(inc)}
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#a855f7' }}
                            title="Verify Incident"
                          >
                            <CheckCircle size={14} /> Verify
                          </button>
                        )}

                        {inc.status === 'VERIFIED' && (
                          <button
                            onClick={() => {
                              setSelectedIncident(inc);
                              setActionType('assign');
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#f59e0b' }}
                            title="Assign Squad"
                          >
                            <UserCheck size={14} /> Assign
                          </button>
                        )}

                        {(inc.status === 'ASSIGNED' || inc.status === 'IN_PROGRESS') && (
                          <button
                            onClick={() => {
                              setSelectedIncident(inc);
                              setActionType('resolve');
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#10b981' }}
                            title="Mark Resolved"
                          >
                            <CheckSquare size={14} /> Resolve
                          </button>
                        )}

                        <Link
                          to={`/incidents/${inc.id}`}
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          title="View Details"
                        >
                          <ExternalLink size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Modals */}
      {selectedIncident && actionType === 'assign' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              Assign Incident {selectedIncident.incident_code}
            </h3>
            <form onSubmit={handleAssignSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 500 }}>
                  Maintenance Team:
                </label>
                <select
                  value={assignedTeam}
                  onChange={(e) => setAssignedTeam(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                >
                  <option value="Shivajinagar Road Repair Squad">Shivajinagar Road Repair Squad</option>
                  <option value="Central Zone Road Maintenance">Central Zone Road Maintenance</option>
                  <option value="Swargate Rapid Asphalt Division">Swargate Rapid Asphalt Division</option>
                  <option value="Aundh-Baner Municipal Unit">Aundh-Baner Municipal Unit</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 500 }}>
                  Assignee Engineer:
                </label>
                <input
                  type="text"
                  required
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setSelectedIncident(null)} className="btn btn-secondary">
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

      {selectedIncident && actionType === 'resolve' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              Mark Resolved: {selectedIncident.incident_code}
            </h3>
            <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem', fontWeight: 500 }}>
                  Resolution Notes & Work Summary:
                </label>
                <textarea
                  rows="3"
                  required
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setSelectedIncident(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: '#10b981' }}>
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

export default Incidents;
