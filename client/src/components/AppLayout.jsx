// components/AppLayout.jsx
// Shared layout for all authenticated pages. Provides a header (with NetGuard
// branding and a logout button) and a left sidebar with navigation.
//
// The children prop is whatever page component is being rendered inside
// (Dashboard, Events, etc.).
//
// Phase 2 addition: when a user is logged in, we open a Socket.io
// connection here so any page inside the layout can use the live
// event stream. We tear it down on logout.

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { connectSocket, disconnectSocket } from '../lib/socket';

const AppLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadIncidents, setUnreadIncidents] = useState(0);
  const [unreadEscalations, setUnreadEscalations] = useState(0);
  const [notice, setNotice] = useState(null); // newest alert shown in the banner

  // Open the socket when the layout mounts (i.e. the user is authed),
  // and close it on unmount (i.e. on logout). The hook dependency is
  // [user] so we reconnect if the user identity changes without a
  // full reload.
  useEffect(() => {
    if (user) {
      connectSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [user]);

  useEffect(() => {
    const socket = connectSocket();
    const onNewIncident = () => {
      if (location.pathname !== '/incidents') {
        setUnreadIncidents((count) => count + 1);
      }
    };

    socket.on('incident:new', onNewIncident);
    return () => socket.off('incident:new', onNewIncident);
  }, [location.pathname]);

  // An escalated threat is somebody saying "this one needs action". Everyone
  // signed in hears about it — except the person who escalated it, who does
  // not need telling.
  useEffect(() => {
    const socket = connectSocket();
    const onEscalated = (threat) => {
      if (threat.escalatedById === user?.id) return;
      setNotice({
        title: `Threat escalated by ${threat.escalatedBy}`,
        detail: `${(threat.severity || '').toUpperCase()} · ${threat.description}`,
        to: `/threats/${threat._id}`,
        linkLabel: 'Open this threat',
      });
      if (location.pathname !== '/threats') {
        setUnreadEscalations((count) => count + 1);
      }
    };

    // Sent to this user's room only, so no filtering is needed — if it arrives,
    // this incident was assigned to the person looking at the screen.
    const onAssigned = (incident) => {
      setNotice({
        title: `${incident.assignedBy} assigned you an incident`,
        detail: incident.severity
          ? `${incident.severity.toUpperCase()} · ${incident.title}`
          : incident.title,
        to: `/incidents/${incident._id}`,
        linkLabel: 'Open this incident',
      });
      if (location.pathname !== '/incidents') {
        setUnreadIncidents((count) => count + 1);
      }
    };

    socket.on('threat:escalated', onEscalated);
    socket.on('incident:assigned', onAssigned);
    return () => {
      socket.off('threat:escalated', onEscalated);
      socket.off('incident:assigned', onAssigned);
    };
  }, [location.pathname, user?.id]);

  useEffect(() => {
    if (location.pathname === '/incidents') {
      setUnreadIncidents(0);
    }
    if (location.pathname === '/threats') {
      setUnreadEscalations(0);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // NavItem is a small inline component so we don't repeat the
  // "is this link active?" logic for every entry.
  const NavItem = ({ to, label, adminOnly }) => {
    const isActive = location.pathname === to;
    if (adminOnly && user?.role !== 'admin') return null;

    return (
      <Link
        to={to}
        className={`block px-3 py-2 rounded text-sm transition-colors ${
          isActive
            ? 'bg-slate-700 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    // h-screen, not min-h-screen: the shell is pinned to the viewport so only
    // <main> scrolls. With min-h-screen a long page (the events table, say)
    // stretched the sidebar past the bottom of the window, which pushed the
    // logout button out of sight until you scrolled.
    <div className="h-screen flex flex-col">
      {/* Header — top bar with NetGuard branding and the user menu */}
      <header className="shrink-0 bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:inline">
            Network Security Monitoring
          </span>
        </div>
        <div className="text-sm text-slate-300">
          <span className="text-slate-500">Logged in as </span>
          <span className="font-medium text-white">{user?.name}</span>
          <span className="ml-2 px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300">
            {user?.role}
          </span>
        </div>
      </header>

      {/* Body — sidebar + main content. min-h-0 lets the row shrink to the
          viewport so the overflow lands on <main> rather than the page. */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — fixed-width nav, always fully visible */}
        <aside className="w-56 shrink-0 bg-slate-850 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-1 overflow-y-auto">
          <NavItem to="/" label="Dashboard" />
          <NavItem to="/events" label="Live Events" />
          <NavItem
            to="/threats"
            label={unreadEscalations > 0 ? `Threats (${unreadEscalations})` : 'Threats'}
          />
          <NavItem
            to="/incidents"
            label={unreadIncidents > 0 ? `Incidents (${unreadIncidents})` : 'Incidents'}
          />
          <NavItem to="/rules" label="Rules" adminOnly />
          <NavItem to="/reports" label="Reports" />

          {/* Logout sits at the very bottom of the sidebar for every role
              (mt-auto pushes it down), split off by a divider so it does not
              read as one more page to visit. */}
          <div className="mt-auto pt-2 border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 rounded text-sm text-red-300 hover:bg-red-900/30 hover:text-red-200 transition-colors"
            >
              Logout
            </button>
          </div>
        </aside>

        {/* Main content area — pages render here */}
        <main className="flex-1 p-6 overflow-auto">
          {notice && (
            <div
              role="alert"
              className="mb-4 flex items-start justify-between gap-4 rounded border border-amber-600 bg-amber-900/30 p-3"
            >
              <div className="text-sm">
                <div className="font-medium text-amber-200">{notice.title}</div>
                <div className="text-amber-100/80">{notice.detail}</div>
                <Link
                  to={notice.to}
                  onClick={() => setNotice(null)}
                  className="text-sky-300 hover:underline"
                >
                  {notice.linkLabel}
                </Link>
              </div>
              <button
                onClick={() => setNotice(null)}
                aria-label="Dismiss alert"
                className="rounded px-2 py-0.5 text-amber-300 hover:bg-amber-800/40"
              >
                &times;
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
