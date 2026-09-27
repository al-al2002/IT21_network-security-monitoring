// components/ProtectedRoute.jsx
// A wrapper component that checks authentication before rendering children.
// If the user is not logged in, redirect to /login.
// If a `role` prop is provided, also check that the user has that role.

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingState from './LoadingState';

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();

  // While we're still loading the user from localStorage, show a tiny
  // placeholder so the page doesn't flicker from /login to the real page.
  if (loading) {
    return <LoadingState label="Checking session" />;
  }

  if (!user) {
    // Not logged in — bounce to login. The `replace` prop prevents the
    // login page from being a "back" target to the protected page.
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    // Logged in but wrong role — bounce to dashboard.
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
