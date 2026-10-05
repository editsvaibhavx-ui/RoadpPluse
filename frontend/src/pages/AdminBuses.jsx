import React, { useState, useEffect } from 'react';
import { Bus, Plus, Trash2, Edit2, Shield } from 'lucide-react';
import { busService, routeService } from '../services/api';

const AdminBuses = () => {
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [bRes, rRes] = await Promise.all([
        busService.getBuses().catch(() => ({ data: [] })),
        routeService.getRoutes().catch(() => ({ data: [] })),
      ]);
      setBuses(Array.isArray(bRes?.data) ? bRes.data : []);
      setRoutes(Array.isArray(rRes?.data) ? rRes.data : []);
    } catch (e) {
      console.error('Failed to load bus telematics:', e);
      setError(e.message || 'Backend unreachable');
      setBuses([]);
      setRoutes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatusToggle = async (bus) => {
    const nextStatus = bus.status === 'Active' ? 'Idle' : 'Active';
    try {
      await busService.updateBus(bus.id, { status: nextStatus });
      fetchData();
    } catch (e) {
      alert('Error updating status');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
          Fleet Configuration & Telematics
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
          Assign routes and manage simulated mobile optical sensors on transit vehicles
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Bus ID</th>
              <th>Assigned Corridor</th>
              <th>Status</th>
              <th>Camera Source</th>
              <th>Telematics Interface</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#991b1b', background: '#fef2f2' }}>
                  ⚠️ Backend Unreachable — Could not load buses: {error}
                </td>
              </tr>
            ) : Array.isArray(buses) && buses.length === 0 && !isLoading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No transit fleet vehicles configured yet.
                </td>
              </tr>
            ) : (
              Array.isArray(buses) && buses.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong style={{ color: '#0284c7' }}>{b.bus_number}</strong>
                </td>
                <td>
                  <span style={{ color: '#334155' }}>{b.route?.route_name || 'Pune Route 01'}</span>
                </td>
                <td>
                  <span
                    style={{
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: b.status === 'Active' ? '#dcfce7' : '#fef3c7',
                      color: b.status === 'Active' ? '#166534' : '#b45309',
                    }}
                  >
                    {b.status}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: '0.8rem', color: '#0369a1' }}>{b.camera_source}</span>
                </td>
                <td>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>REST (MQTT Abstraction)</span>
                </td>
                <td>
                  <button
                    onClick={() => handleStatusToggle(b)}
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    Toggle {b.status === 'Active' ? 'Idle' : 'Active'}
                  </button>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminBuses;
