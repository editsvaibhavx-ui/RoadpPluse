import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { authService, videoService } from './services/api';

import DashboardLayout from './layouts/DashboardLayout';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Fleet from './pages/Fleet';
import Camera from './pages/Camera';
import Upload from './pages/Upload';
import Detections from './pages/Detections';
import Incidents from './pages/Incidents';
import IncidentDetails from './pages/IncidentDetails';
import LiveMap from './pages/LiveMap';
import Analytics from './pages/Analytics';
import Notifications from './pages/Notifications';
import AdminUsers from './pages/AdminUsers';
import AdminBuses from './pages/AdminBuses';
import AdminRoutes from './pages/AdminRoutes';
import Sessions from './pages/Sessions';
import SessionDetail from './pages/SessionDetail';
import Settings from './pages/Settings';

const ProtectedRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
  };

  const handleDemoStart = async () => {
    try {
      await videoService.startDemo();
      window.location.href = '/dashboard';
    } catch (e) {
      console.error('Demo error:', e);
      alert('Demo execution completed or error: ' + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public Login Route */}
          <Route
            path="/login"
            element={
              currentUser ? <Navigate to="/dashboard" replace /> : <Login onLoginSuccess={handleLoginSuccess} />
            }
          />

          {/* Protected Dashboard Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute user={currentUser}>
                <DashboardLayout
                  currentUser={currentUser}
                  onLogout={handleLogout}
                  onDemoStart={handleDemoStart}
                />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="fleet" element={<Fleet />} />
            <Route path="camera" element={<Camera />} />
            <Route path="upload" element={<Upload />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:id" element={<SessionDetail />} />
            <Route path="detections" element={<Detections />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetails />} />
            <Route path="map" element={<LiveMap />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/buses" element={<AdminBuses />} />
            <Route path="admin/routes" element={<AdminRoutes />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
