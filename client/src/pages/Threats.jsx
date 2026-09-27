// pages/Threats.jsx
// List view of threats. Subscribes to 'threat:new' and 'threat:updated'
// over Socket.io so the list stays live without polling.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import LoadingState from '../components/LoadingState';

const SEVERITY_BADGES = {
  low:      'bg-emerald-900/40 text-emerald-300 border-emerald-700',
  medium:   'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  high:     'bg-orange-900/40 text-orange-300 border-orange-700',
  critical: 'bg-red-900/40 text-red-300 border-red-700',
};

const STATUS_BADGES = {
  new:       'bg-sky-900/40 text-sky-300 border-sky-700',
  reviewed:  'bg-slate-700 text-slate-300 border-slate-600',
  escalated: 'bg-red-900/40 text-red-300 border-red-700',
};

const Threats = () => {
  const [threats, setThreats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');

  const fetchThreats = async () => {
    const params = new URLSearchParams();
    if (severity !== 'all') params.set('severity', severity);
    if (status !== 'all') params.set('status', status);
    const data = await api.get(`/threats?${params.toString()}`);
    setThreats(data.threats);
  };

  useEffect(() => {
    (async () => {
      try {
        await fetchThreats();
      } catch (err) {
        console.error('Failed to load threats:', err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, status]);

  // Live updates from the analyzer.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNew = (t) => {
      // Only re-fetch if filters allow this threat through.
      if (severity !== 'all' && t.severity !== severity) return;
      if (status !== 'all' && t.status !== status) return;
      setThreats((prev) => [t, ...prev]);
    };
    const onUpdated = (t) => {
      setThreats((prev) => prev.map((x) => (x._id === t._id ? t : x)));
    };
    socket.on('threat:new', onNew);
    socket.on('threat:updated', onUpdated);
    return () => {
      socket.off('threat:new', onNew);
      socket.off('threat:updated', onUpdated);
    };
  }, [severity, status]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.patch(`/threats/${id}`, { status: newStatus });
    } catch (err) {
      console.error('Failed to update threat:', err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-white">Threats</h2>
        <div className="flex items-center gap-2">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5"
          >
            <option value="all">All severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5"
          >
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr className="text-left text-slate-400">
              <th className="px-4 py-2 font-medium">Detected</th>
              <th className="px-4 py-2 font-medium">Rule</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6}><LoadingState label="Loading threats" compact /></td></tr>
            )}
            {!loading && threats.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 py-8">No threats match the current filters.</td></tr>
            )}
            {threats.map((t) => (
              <tr key={t._id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                <td className="px-4 py-2 text-slate-300 font-mono text-xs">
                  {new Date(t.detectedAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-slate-200">{t.ruleTriggered}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_BADGES[t.severity]}`}>
                    {t.severity}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_BADGES[t.status]}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-300 max-w-md truncate" title={t.description}>
                  {t.description}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/threats/${t._id}`}
                      className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                    >
                      View
                    </Link>
                    {t.status === 'new' && (
                      <button
                        onClick={() => handleStatusChange(t._id, 'reviewed')}
                        className="text-xs px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white"
                      >
                        Mark reviewed
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Threats;
