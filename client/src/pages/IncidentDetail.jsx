// pages/IncidentDetail.jsx
// The full incident workspace:
//   - Title, description, status, severity (from linked threat)
//   - Assignee picker (loads all users on mount)
//   - Status changer (with auto-logging on the backend). Choosing "Resolved"
//     asks for a resolution note first; the server rejects a resolve without one.
//   - Action log timeline (append-only)
//   - "Add note" form that appends a free-text action entry
//
// The timeline is the audit trail — every change is recorded with
// who did it and when. The backend enforces this; the client just
// renders it.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import LoadingState from '../components/LoadingState';
import { getSocket } from '../lib/socket';

const STATUS_COLORS = {
  open:          'text-red-300',
  investigating: 'text-amber-300',
  resolved:      'text-emerald-300',
};

const IncidentDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [incident, setIncident] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolutionText, setResolutionText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [inc, usr] = await Promise.all([
          api.get(`/incidents/${id}`),
          api.get('/users'),
        ]);
        setIncident(inc.incident);
        setUsers(usr.users);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Live updates from other clients (e.g. another analyst changing status)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdated = (i) => {
      if (i._id === id) setIncident(i);
    };
    socket.on('incident:updated', onUpdated);
    return () => socket.off('incident:updated', onUpdated);
  }, [id]);

  const updateField = async (body) => {
    try {
      const data = await api.patch(`/incidents/${id}`, body);
      setIncident(data.incident);
      return true;
    } catch (err) {
      alert('Update failed: ' + err.message);
      return false;
    }
  };

  // "Resolved" is not applied straight from the dropdown: it opens a form for
  // the resolution note, and only submitting that form resolves the incident.
  const changeStatus = (status) => {
    if (status === 'resolved') {
      setResolutionText('');
      setResolving(true);
      return;
    }
    setResolving(false);
    updateField({ status });
  };

  const submitResolution = async (e) => {
    e.preventDefault();
    if (!resolutionText.trim()) return;
    setSubmitting(true);
    const ok = await updateField({ status: 'resolved', resolution: resolutionText.trim() });
    setSubmitting(false);
    if (ok) setResolving(false);
  };

  const submitNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      const data = await api.post(`/incidents/${id}/actions`, { action: noteText.trim() });
      setIncident(data.incident);
      setNoteText('');
    } catch (err) {
      alert('Failed to add note: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading incident" />;
  if (error) return <p className="text-red-400">Error: {error}</p>;
  if (!incident) return <p className="text-slate-400">Not found.</p>;

  const threat = incident.threatId;
  const sortedLog = [...(incident.actionLog || [])].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  // Mirrors denyReason() in server/controllers/incidentController.js. The
  // server is what actually enforces this; doing it here too means an analyst
  // sees a disabled control and a reason instead of a 403 after the fact.
  const assignedToMe = incident.assignedTo?._id === user?.id;
  const canEdit = isAdmin || assignedToMe;
  const cannotEditReason = incident.assignedTo
    ? `Assigned to ${incident.assignedTo.name}. Only they or an admin can update it.`
    : 'This incident is unassigned. Ask an admin to assign it to you.';

  return (
    <div>
      <Link to="/incidents" className="text-sm text-sky-400 hover:underline">&larr; Back to incidents</Link>
      <h2 className="text-2xl font-semibold text-white mt-2 mb-4">Incident Detail</h2>

      {/* Top card: title + status controls */}
      <div className="bg-slate-800 border border-slate-700 rounded p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <div className="text-xs text-slate-400">Title</div>
            <div className="text-xl text-white">{incident.title}</div>
          </div>
          <span className={`text-sm font-medium ${STATUS_COLORS[incident.status]}`}>
            {incident.status.toUpperCase()}
          </span>
        </div>

        {incident.description && (
          <div className="mb-3">
            <div className="text-xs text-slate-400">Description</div>
            <div className="text-slate-200 text-sm whitespace-pre-wrap">{incident.description}</div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">Status</div>
            <select
              value={resolving ? 'resolved' : incident.status}
              onChange={(e) => changeStatus(e.target.value)}
              disabled={!canEdit}
              className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
            </select>
            {!canEdit && (
              <div className="text-[11px] text-amber-400/80 mt-1">{cannotEditReason}</div>
            )}
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Assigned to</div>
            <select
              value={incident.assignedTo?._id || ''}
              onChange={(e) => updateField({ assignedTo: e.target.value || null })}
              disabled={!isAdmin}
              className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">— Unassigned —</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
            {!isAdmin && (
              <div className="text-[11px] text-slate-400 mt-1">Only admins can assign incidents.</div>
            )}
          </div>
          <div>
            <div className="text-xs text-slate-400">Created</div>
            <div className="text-slate-200 text-sm">{new Date(incident.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Resolved</div>
            <div className="text-slate-200 text-sm">
              {incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleString() : '—'}
            </div>
          </div>
        </div>

        {resolving && incident.status !== 'resolved' && (
          <form onSubmit={submitResolution} className="mt-4 border-t border-slate-700 pt-4">
            <label className="text-xs text-slate-400" htmlFor="resolution">
              Resolution — how was this incident resolved?
            </label>
            <textarea
              id="resolution"
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              rows={3}
              maxLength={1000}
              autoFocus
              placeholder="e.g. Blocked 172.16.0.1 on the firewall. No successful login found; no compromise."
              className="mt-1 w-full resize-y rounded bg-slate-900 border border-slate-700 px-3 py-2 text-white text-sm"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolving(false)}
                className="px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !resolutionText.trim()}
                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-600 text-white text-sm"
              >
                {submitting ? 'Resolving...' : 'Resolve incident'}
              </button>
            </div>
          </form>
        )}

        {incident.status === 'resolved' && incident.resolution && (
          <div className="mt-4 border-t border-slate-700 pt-4">
            <div className="text-xs text-slate-400">Resolution</div>
            <div className="text-emerald-200 text-sm whitespace-pre-wrap">{incident.resolution}</div>
          </div>
        )}
      </div>

      {/* Linked threat summary */}
      {threat && (
        <div className="bg-slate-800 border border-slate-700 rounded p-5 mb-4">
          <h3 className="text-lg font-semibold text-white mb-2">Linked Threat</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-400">Rule</div>
              <div className="text-white">{threat.ruleTriggered}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Severity</div>
              <div className="text-white">{threat.severity}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Description</div>
              <div className="text-slate-200">{threat.description}</div>
            </div>
          </div>
          <div className="mt-3">
            <Link
              to={`/threats/${threat._id}`}
              className="text-sm text-sky-400 hover:underline"
            >
              View full threat detail &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* Add note form */}
      <div className="bg-slate-800 border border-slate-700 rounded p-5 mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">Add note</h3>
        {canEdit ? (
          <form onSubmit={submitNote} className="flex gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Describe what you did or observed..."
              className="flex-1 px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white text-sm"
            />
            <button
              type="submit"
              disabled={submitting || !noteText.trim()}
              className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white text-sm"
            >
              {submitting ? 'Adding...' : 'Add'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-400">{cannotEditReason}</p>
        )}
      </div>

      {/* Action log timeline */}
      <div className="bg-slate-800 border border-slate-700 rounded p-5">
        <h3 className="text-lg font-semibold text-white mb-3">
          Action Log ({sortedLog.length})
        </h3>
        {sortedLog.length === 0 ? (
          <p className="text-slate-400 text-sm">No actions yet.</p>
        ) : (
          <ol className="relative border-l border-slate-700 ml-2 space-y-4">
            {sortedLog.map((entry, idx) => (
              <li key={idx} className="ml-4">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-sky-500" />
                <div className="text-sm text-slate-200">{entry.action}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {entry.by?.name || 'unknown'} &middot; {new Date(entry.timestamp).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

export default IncidentDetail;
