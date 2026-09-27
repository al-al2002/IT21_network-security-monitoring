// App.jsx
// Top-level component. Sets up routing and wraps everything in the AuthProvider
// (defined in /context — wired up in Phase 1's auth step).
//
// Route structure:
//   /login            -> public
//   /register         -> public
//   /                 -> Dashboard          (protected)
//   /events           -> Live Monitoring    (protected)
//   /threats          -> Threats list       (protected)
//   /threats/:id      -> Threat detail      (protected)
//   /incidents        -> Incidents list     (protected)
//   /incidents/:id    -> Incident detail    (protected)
//   /rules            -> Rules management   (protected, admin only)
//   /reports          -> Reports / export   (protected)

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';

// Pages — placeholders for now, filled in during their respective phases.
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import Threats from './pages/Threats';
import ThreatDetail from './pages/ThreatDetail';
import Incidents from './pages/Incidents';
import IncidentDetail from './pages/IncidentDetail';
import Rules from './pages/Rules';
import Reports from './pages/Reports';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes — wrapped in AppLayout so they share the header/sidebar */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/events"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Events />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/threats"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Threats />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/threats/:id"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <ThreatDetail />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/incidents"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Incidents />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/incidents/:id"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <IncidentDetail />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rules"
            element={
              <ProtectedRoute role="admin">
                <AppLayout>
                  <Rules />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <Reports />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Catch-all — redirect unknown paths to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
