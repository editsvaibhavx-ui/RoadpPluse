import React, { useState, useEffect } from 'react';
import { Bus as BusIcon, Plus, Edit2, Trash2, Camera, CheckCircle, RefreshCw } from 'lucide-react';
import { busService, routeService } from '../services/api';

const Fleet = () => {
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    bus_number: '',
    route_id: '',
    status: 'Active',
    camera_source: 'Smartphone Simulation',
    device_info: 'Android / iOS Smartphone Camera (1080p)',
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [busRes, routeRes] = await Promise.all([
        busService.getBuses().catch(() => ({ data: [] })),
        routeService.getRoutes().catch(() => ({ data: [] })),
      ]);
      setBuses(Array.isArray(busRes?.data) ? busRes.data : []);
      const rData = Array.isArray(routeRes?.data) ? routeRes.data : [];
      setRoutes(rData);
      if (rData.length > 0 && !formData.route_id) {
        setFormData((prev) => ({ ...prev, route_id: rData[0].id }));
      }
    } catch (err) {
      console.error('Failed to load fleet data:', err);
      setBuses([]);
      setRoutes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateBus = async (e) => {
    e.preventDefault();
    try {
      await busService.createBus(formData);
      setShowModal(false);
      setFormData({
        bus_number: '',
        route_id: routes[0]?.id || '',
        status: 'Active',
        camera_source: 'Smartphone Simulation',
        device_info: 'Android / iOS Smartphone Camera (1080p)',
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create bus');
    }
  };

  const handleDeleteBus = async (id) => {
    if (window.confirm('Delete this demo bus from fleet?')) {
      try {
        await busService.deleteBus(id);
        fetchData();
      } catch (err) {
        alert('Failed to delete bus');
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            Public Transport Fleet Management
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Simulated city bus fleet equipped with smartphone dash-mount mobile sensing units
          </p>
        </div>

        <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ gap: '0.4rem' }}>
          <Plus size={16} />
          Register Demo Bus
        </button>
      </div>

      {/* Fleet Cards Grid */}
      <div className="grid-cols-2">
        {buses.map((bus) => (
          <div
            key={bus.id}
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1rem',
              borderLeft: bus.status === 'Active' ? '4px solid #10b981' : '4px solid #f59e0b',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: '#e0f2fe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7',
                    }}
                  >
                    <BusIcon size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>{bus.bus_number}</h3>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {bus.route ? bus.route.route_name : 'Pune Route 01'}
                    </span>
                  </div>
                </div>

                <span
                  style={{
                    padding: '0.2rem 0.6rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: bus.status === 'Active' ? '#dcfce7' : '#fef3c7',
                    color: bus.status === 'Active' ? '#059669' : '#d97706',
                    border: bus.status === 'Active' ? '1px solid #86efac' : '1px solid #fde68a',
                  }}
                >
                  {bus.status}
                </span>
              </div>

              <div
                style={{
                  marginTop: '1.2rem',
                  padding: '0.75rem 1rem',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#0f172a' }}>
                  <Camera size={14} color="#0284c7" />
                  <span>Camera: <strong>{bus.camera_source}</strong></span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Hardware: {bus.device_info}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Simulated Telematics: REST API (MQTT edge abstraction ready)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
              <button
                onClick={() => handleDeleteBus(bus.id)}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', color: '#dc2626' }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Register Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              Register Simulated Transit Bus
            </h3>
            <form onSubmit={handleCreateBus} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem' }}>
                  Bus Identifier (e.g., BUS-004)
                </label>
                <input
                  type="text"
                  required
                  placeholder="BUS-004"
                  value={formData.bus_number}
                  onChange={(e) => setFormData({ ...formData, bus_number: e.target.value })}
                  style={{ width: '100%', padding: '0.55rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem' }}>
                  Assigned Route
                </label>
                <select
                  value={formData.route_id}
                  onChange={(e) => setFormData({ ...formData, route_id: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '0.55rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.route_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '0.3rem' }}>
                  Camera Source
                </label>
                <input
                  type="text"
                  value={formData.camera_source}
                  disabled
                  style={{ width: '100%', padding: '0.55rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#64748b' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Register Bus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Fleet;
