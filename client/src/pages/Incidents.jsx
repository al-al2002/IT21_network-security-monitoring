// pages/Incidents.jsx
// List of incidents with status filter. Subscribes to 'incident:new'
// and 'incident:updated' so the list updates live as analysts work.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import LoadingState from '../components/LoadingState';

const STATUS_BADGES = {
  open:          'bg-red-900/40 text-red-300 border-red-700',
  investigating: 'bg-amber-900/40 text-amber-300 border-amber-700',
  resolved:      'bg-emerald-900/40 text-emerald-300 border-emerald-700',
};

const Incidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');

  const fetchIncidents = async () => {
    const qs = status === 'all' ? '' : `?status=${status}`;
    const data = await api.get(`/incidents${qs}`);
    setIncidents(data.incidents);
  };

  useEffect(() => {
    (async () => {
      try {
        await fetchIncidents();
      } catch (err) {
        console.error('Failed to load incidents:', err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNew = (i) => {
      if (status !== 'all' && i.status !== status) return;
      setIncidents((prev) => [i, ...prev]);
    };
    const onUpdated = (i) => {
      setIncidents((prev) => {
        // If the status filter no longer matches, drop the row
        if (status !== 'all' && i.status !== status) {
          return prev.filter((x) => x._id !== i._id);
        }
        return prev.map((x) => (x._id === i._id ? i : x));
      });
    };
    socket.on('incident:new', onNew);
    socket.on('incident:updated', onUpdated);
    return () => {
      socket.off('incident:new', onNew);
      socket.off('incident:updated', onUpdated);
    };
  }, [status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-white">Incidents</h2>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr className="text-left text-slate-400">
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Assigned to</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6}><LoadingState label="Loading incidents" compact /></td></tr>
            )}
            {!loading && incidents.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 py-8">No incidents. Create one from a threat to start.</td></tr>
            )}
            {incidents.map((i) => (
              <tr key={i._id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                <td className="px-4 py-2 text-white max-w-md truncate" title={i.title}>{i.title}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_BADGES[i.status]}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-300">
                  {i.threatId?.severity || '—'}
                </td>
                <td className="px-4 py-2 text-slate-300">
                  {i.assignedTo ? i.assignedTo.name : <span className="text-slate-500">unassigned</span>}
                </td>
                <td className="px-4 py-2 text-slate-400 text-xs">
                  {new Date(i.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <Link
                    to={`/incidents/${i._id}`}
                    className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Incidents;
