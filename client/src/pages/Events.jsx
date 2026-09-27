// pages/Events.jsx
// Live event feed. On mount we fetch the most recent 50 events via
// GET /api/events, then we subscribe to Socket.io's 'event:new' and
// prepend each new event to the table. A live "pulse" indicator in
// the header shows the socket is connected.
//
// We also support filtering by eventType and a "pause" toggle so an
// analyst can freeze the feed while inspecting a row.

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import LoadingState from '../components/LoadingState';

const TYPE_BADGES = {
  login_attempt:     'bg-sky-900/40 text-sky-300 border-sky-700',
  port_scan:         'bg-purple-900/40 text-purple-300 border-purple-700',
  traffic:           'bg-slate-700 text-slate-300 border-slate-600',
  malware_signature: 'bg-red-900/40 text-red-300 border-red-700',
  firewall_block:    'bg-amber-900/40 text-amber-300 border-amber-700',
};

const Events = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null);

  // Refs let the socket callback see the *current* value of `paused`
  // and `filter` without re-subscribing every time they change.
  const pausedRef = useRef(paused);
  const filterRef = useRef(filter);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { filterRef.current = filter; }, [filter]);

  // Initial load: fetch the last 50 events + summary stats.
  useEffect(() => {
    (async () => {
      try {
        const [list, summary] = await Promise.all([
          api.get('/events?limit=50'),
          api.get('/events/stats'),
        ]);
        setEvents(list.events);
        setStats(summary);
      } catch (err) {
        console.error('Failed to load events:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Subscribe to Socket.io. The cleanup function unsubscribes on unmount.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNewEvent   = (evt) => {
      // Respect the pause toggle: if paused, do nothing.
      if (pausedRef.current) return;
      // Apply the current filter.
      if (filterRef.current !== 'all' && evt.eventType !== filterRef.current) return;
      setEvents((prev) => [evt, ...prev].slice(0, 200)); // cap at 200 to keep DOM small
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('event:new', onNewEvent);

    // The socket may already be connected (AppLayout connected it
    // before this page mounted). Set the initial state accordingly.
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('event:new', onNewEvent);
    };
  }, []);

  // When the filter changes, refetch so the table shows the right slice
  // of history (otherwise we'd just show whatever last matched).
  useEffect(() => {
    if (loading) return;
    (async () => {
      const qs = filter === 'all' ? '?limit=50' : `?limit=50&eventType=${filter}`;
      const list = await api.get(`/events${qs}`);
      setEvents(list.events);
    })();
  }, [filter]);

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString();
  };

  return (
    <div>
      {/* Header row: title + live indicator + controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-white">Live Events</h2>
          <span
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${
              connected
                ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5"
          >
            <option value="all">All types</option>
            <option value="login_attempt">Login attempts</option>
            <option value="port_scan">Port scans</option>
            <option value="firewall_block">Firewall blocks</option>
            <option value="traffic">Traffic</option>
            <option value="malware_signature">Malware signatures</option>
          </select>
          <button
            onClick={() => setPaused((p) => !p)}
            className={`text-sm px-3 py-1.5 rounded border ${
              paused
                ? 'bg-amber-900/40 border-amber-700 text-amber-200'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>

      {/* Summary row */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-slate-800 border border-slate-700 rounded p-3">
            <div className="text-xs text-slate-400">Events (24h)</div>
            <div className="text-xl font-semibold text-white">{stats.totalToday}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded p-3">
            <div className="text-xs text-slate-400">Flagged (24h)</div>
            <div className="text-xl font-semibold text-amber-300">{stats.flaggedToday}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded p-3">
            <div className="text-xs text-slate-400">Total in DB</div>
            <div className="text-xl font-semibold text-white">{stats.totalAll}</div>
          </div>
        </div>
      )}

      {/* Event table */}
      <div className="bg-slate-800 border border-slate-700 rounded overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 sticky top-0">
              <tr className="text-left text-slate-400">
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Source IP</th>
                <th className="px-4 py-2 font-medium">Dest IP</th>
                <th className="px-4 py-2 font-medium">Protocol</th>
                {/* Port is the one numeric column, so it is right-aligned:
                    digits then line up by place value down the column. */}
                <th className="px-4 py-2 font-medium text-right">Port</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7}><LoadingState label="Loading events" compact /></td>
                </tr>
              )}
              {!loading && events.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-8">
                    No events yet. New events stream in every few seconds.
                  </td>
                </tr>
              )}
              {events.map((evt) => (
                <tr
                  key={evt._id}
                  className="border-t border-slate-700/50 hover:bg-slate-750 hover:bg-slate-700/30"
                >
                  <td className="px-4 py-2 text-slate-300 font-mono text-xs">
                    {formatTime(evt.timestamp)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded border ${TYPE_BADGES[evt.eventType] || TYPE_BADGES.traffic}`}>
                      {evt.eventType}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-200 font-mono text-xs">{evt.sourceIP}</td>
                  <td className="px-4 py-2 text-slate-200 font-mono text-xs">{evt.destinationIP}</td>
                  <td className="px-4 py-2 text-slate-300">{evt.protocol}</td>
                  <td className="px-4 py-2 text-slate-300 text-right tabular-nums">
                    {evt.port ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    {evt.status === 'flagged' ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700">
                        flagged
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">normal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Events;
