import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Shield, User } from 'lucide-react';
import { adminService } from '../services/api';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    role: 'authority',
  });

  const [error, setError] = useState(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminService.getUsers();
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to load users:', e);
      setError(e.message || 'Backend unreachable');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await adminService.createUser(formData);
      setShowModal(false);
      setFormData({ username: '', password: '', full_name: '', email: '', role: 'authority' });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleDelete = async (id, uname) => {
    if (uname === 'admin') {
      alert('Cannot delete primary admin account');
      return;
    }
    if (window.confirm(`Delete user ${uname}?`)) {
      try {
        await adminService.deleteUser(id);
        fetchUsers();
      } catch (e) {
        alert('Failed to delete user');
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            User & Role Management
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Manage platform access roles for Administrators and Municipal Road Authorities
          </p>
        </div>

        <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ gap: '0.4rem' }}>
          <Plus size={16} /> Add User
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#991b1b', background: '#fef2f2' }}>
                  ⚠️ Backend Unreachable — Could not load users: {error}
                </td>
              </tr>
            ) : Array.isArray(users) && users.length === 0 && !isLoading ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No system users found.
                </td>
              </tr>
            ) : (
              Array.isArray(users) && users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                      <User size={16} />
                    </div>
                    <strong style={{ color: '#0f172a' }}>{u.full_name || u.username}</strong>
                  </div>
                </td>
                <td><span className="font-mono" style={{ color: '#0284c7', fontWeight: 600 }}>{u.username}</span></td>
                <td><span style={{ color: '#64748b' }}>{u.email || '—'}</span></td>
                <td>
                  <span
                    style={{
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: u.role === 'admin' ? '#e0f2fe' : '#dcfce7',
                      color: u.role === 'admin' ? '#0369a1' : '#166534',
                      textTransform: 'uppercase',
                    }}
                  >
                    {u.role === 'admin' ? 'Administrator' : 'Municipal Authority'}
                  </span>
                </td>
                <td>
                  {u.username !== 'admin' && (
                    <button
                      onClick={() => handleDelete(u.id, u.username)}
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', color: '#fca5a5' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#0f172a' }}>
              Create System User
            </h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Username</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Password</label>
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#0f172a' }}
                >
                  <option value="authority">Municipal Authority</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
