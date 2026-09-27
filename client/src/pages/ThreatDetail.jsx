// pages/ThreatDetail.jsx
// Shows one threat, its linked events, and lets the analyst change status
// or open an incident for it. A threat has at most one incident: once it
// exists, the page links to it instead of offering to create another.

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import LoadingState from '../components/LoadingState';

const SEVERITY_COLORS = {
  low:      'text-emerald-300',
  medium:   'text-yellow-300',
  high:     'text-orange-300',
  critical: 'text-red-300',
};

const ThreatDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [threat, setThreat] = useState(null);
  const [events, setEvents] = useState([]);
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [creatingIncident, setCreatingIncident] = useState(false);
  const [incidentError, setIncidentError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(`/threats/${id}`);
        setThreat(data.threat);
        setEvents(data.events);
        setIncident(data.incident);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const changeStatus = async (newStatus) => {
    try {
      const data = await api.patch(`/threats/${id}`, { status: newStatus });
      setThreat(data.threat);
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const openIncidentModal = () => {
    setIncidentTitle(`${threat.ruleTriggered}: ${threat.description.slice(0, 60)}`);
    setIncidentDescription(`Auto-created from threat. ${threat.description}`);
    setIncidentError('');
    setShowIncidentModal(true);
  };

  const createIncident = async (event) => {
    event.preventDefault();
    if (!incidentTitle.trim()) return;
    setCreatingIncident(true);
    try {
      const data = await api.post('/incidents', {
        threatId: id,
        title: incidentTitle.trim(),
        description: incidentDescription.trim(),
      });
      navigate(`/incidents/${data.incident._id}`);
    } catch (err) {
      // Shown in the dialog so the threat page stays usable (e.g. someone
      // else opened an incident for this threat a moment ago).
      setIncidentError(err.message);
    } finally {
      setCreatingIncident(false);
    }
  };

  if (loading) return <LoadingState label="Loading threat" />;
  if (error) return <p className="text-red-400">Error: {error}</p>;
  if (!threat) return <p className="text-slate-400">Not found.</p>;

  return (
    <div>
      <Link to="/threats" className="text-sm text-sky-400 hover:underline">&larr; Back to threats</Link>
      <h2 className="text-2xl font-semibold text-white mt-2 mb-4">Threat Detail</h2>

      <div className="bg-slate-800 border border-slate-700 rounded p-5 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-slate-400">Rule</div>
            <div className="text-white">{threat.ruleTriggered}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Severity</div>
            <div className={SEVERITY_COLORS[threat.severity]}>{threat.severity}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Status</div>
            <div className="text-white">{threat.status}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Detected at</div>
            <div className="text-white text-sm">{new Date(threat.detectedAt).toLocaleString()}</div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-slate-400">Description</div>
            <div className="text-white">{threat.description}</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {threat.status === 'new' && (
            <button
              onClick={() => changeStatus('reviewed')}
              className="text-sm px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white"
            >
              Mark as reviewed
            </button>
          )}
          {threat.status !== 'escalated' && (
            <button
              onClick={() => changeStatus('escalated')}
              className="text-sm px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white"
            >
              Escalate
            </button>
          )}
          {incident ? (
            <Link
              to={`/incidents/${incident._id}`}
              className="text-sm px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-white"
            >
              View incident ({incident.status})
            </Link>
          ) : (
            <button
              onClick={openIncidentModal}
              className="text-sm px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-white"
            >
              Create incident
            </button>
          )}
        </div>
      </div>

      <h3 className="text-lg font-semibold text-white mb-2">
        Linked Events ({events.length})
      </h3>
      <div className="bg-slate-800 border border-slate-700 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr className="text-left text-slate-400">
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Source IP</th>
              <th className="px-4 py-2 font-medium">Dest IP</th>
              <th className="px-4 py-2 font-medium">Port</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e._id} className="border-t border-slate-700/50">
                <td className="px-4 py-2 text-slate-300 font-mono text-xs">
                  {new Date(e.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-slate-200">{e.eventType}</td>
                <td className="px-4 py-2 text-slate-200 font-mono text-xs">{e.sourceIP}</td>
                <td className="px-4 py-2 text-slate-200 font-mono text-xs">{e.destinationIP}</td>
                <td className="px-4 py-2 text-slate-300">{e.port ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-600 bg-slate-800 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-amber-300">Incident response</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Create an incident</h3>
                <p className="mt-1 text-sm text-slate-400">Record the response for this detected threat.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowIncidentModal(false)}
                className="text-slate-400 hover:text-white text-xl leading-none"
                aria-label="Close incident dialog"
              >
                ×
              </button>
            </div>
            <form onSubmit={createIncident} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-slate-300" htmlFor="incident-title">Incident title</label>
                <input
                  id="incident-title"
                  value={incidentTitle}
                  onChange={(event) => setIncidentTitle(event.target.value)}
                  required
                  className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300" htmlFor="incident-description">Description</label>
                <textarea
                  id="incident-description"
                  value={incidentDescription}
                  onChange={(event) => setIncidentDescription(event.target.value)}
                  rows={4}
                  className="w-full resize-y rounded border border-slate-600 bg-slate-900 px-3 py-2 text-white outline-none focus:border-amber-400"
                />
              </div>
              {incidentError && (
                <p className="text-sm text-red-400">{incidentError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(false)}
                  className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingIncident}
                  className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingIncident ? 'Creating...' : 'Create incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreatDetail;
