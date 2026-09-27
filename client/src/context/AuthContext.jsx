// context/AuthContext.jsx
// React context that owns the current user. Anywhere in the tree, a
// component can call useAuth() to get { user, login, register, logout }.
//
// Lifecycle on page load:
//   1. We read the JWT from localStorage
//   2. We call GET /api/auth/me to verify the token still works
//   3. If yes, setUser(decoded user). If no, clear the token.
//
// Why verify on every page load instead of just trusting localStorage?
// Tokens can be invalidated server-side, the user could be deleted,
// or the JWT_SECRET could rotate. Verifying is cheap and correct.

import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'netguard_token';
const USER_KEY = 'netguard_user';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: try to restore a session from localStorage.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const cachedUser = localStorage.getItem(USER_KEY);

    if (!token) {
      setLoading(false);
      return;
    }

    // We optimistically restore from cache so the UI doesn't flicker
    // while we verify. If the verify fails, we clear everything.
    if (cachedUser) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch {
        // Corrupted cache — ignore, we'll re-fetch.
      }
    }

    api
      .get('/auth/me')
      .then((data) => {
        setUser(data.user);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      })
      .catch(() => {
        // Token invalid/expired — wipe storage and force re-login.
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password) => {
    const data = await api.post('/auth/register', { name, email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
