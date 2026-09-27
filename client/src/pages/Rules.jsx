// pages/Rules.jsx
// Admin-only: list, create, edit, delete, and toggle detection rules.
// The create/edit form takes a JSON `condition` blob — for a real product
// you'd build a form per rule type, but a JSON textarea is fine for a
// capstone and is also more flexible (it can represent any new rule type
// without a UI change).

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import LoadingState from '../components/LoadingState';

const Rules = () => {
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // rule being edited, or null
  const [showNew, setShowNew] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // rule mid-delete, or null
  const [error, setError] = useState('');

  const fetchRules = async () => {
    const data = await api.get('/rules');
    setRules(data.rules);
  };

  useEffect(() => {
    (async () => {
      try {
        await fetchRules();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isAdmin = user?.role === 'admin';

  // Deleting a rule cannot be undone, so confirm first. Threats the rule has
  // already produced are deliberately left alone — they are records of
  // detections that really happened while the rule was active, not children
  // of the rule that should disappear with it.
  const handleDelete = async (rule) => {
    const confirmed = window.confirm(
      `Delete the rule "${rule.name}"?\n\n` +
        'This cannot be undone. Threats it has already created are kept.'
    );
    if (!confirmed) return;

    setError('');
    setDeletingId(rule._id);
    try {
      await api.delete(`/rules/${rule._id}`);
      await fetchRules();
    } catch (err) {
      // The server rejects this with 403 for a non-admin, so a failure here is
      // worth showing rather than swallowing.
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-white">Detection Rules</h2>
        {isAdmin && (
          <button
            onClick={() => { setShowNew(true); setEditing(null); }}
            className="text-sm px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white"
          >
            + New rule
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="mb-4 p-3 rounded bg-amber-900/30 border border-amber-700 text-amber-200 text-sm">
          You are viewing rules in read-only mode. Only admins can create or modify rules.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr className="text-left text-slate-400">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Severity</th>
              <th className="px-4 py-2 font-medium">Condition</th>
              <th className="px-4 py-2 font-medium">Active</th>
              {isAdmin && <th className="px-4 py-2 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={isAdmin ? 5 : 4}><LoadingState label="Loading rules" compact /></td></tr>
            )}
            {!loading && rules.length === 0 && (
              <tr><td colSpan={isAdmin ? 5 : 4} className="text-center text-slate-400 py-8">No rules yet.</td></tr>
            )}
            {rules.map((r) => (
              <tr key={r._id} className="border-t border-slate-700/50">
                <td className="px-4 py-2 text-white">{r.name}</td>
                <td className="px-4 py-2 text-slate-300">{r.severity}</td>
                <td className="px-4 py-2 text-slate-400 font-mono text-xs">
                  {JSON.stringify(r.condition)}
                </td>
                <td className="px-4 py-2">
                  <span className={r.isActive ? 'text-emerald-300' : 'text-slate-500'}>
                    {r.isActive ? 'Yes' : 'No'}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditing(r); setShowNew(false); }}
                        className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r._id}
                        className="text-xs px-2 py-1 rounded bg-red-900/60 hover:bg-red-800 disabled:opacity-50 text-red-200"
                      >
                        {deletingId === r._id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(showNew || editing) && isAdmin && (
        <RuleForm
          initial={editing}
          onClose={() => { setEditing(null); setShowNew(false); }}
          onSaved={async () => {
            await fetchRules();
            setEditing(null);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
};

// The detection types the analyzer can actually evaluate, described so the
// form can build the condition JSON instead of asking an admin to type it.
// Keep this in sync with EVALUATORS in server/services/analyzer.js — a type
// listed here that the analyzer doesn't implement will silently never fire.
const RULE_TYPES = {
  failed_login_count: {
    label: 'Repeated failed logins',
    help: 'Fires when one source IP fails to log in too many times in a short window.',
    fields: [
      { key: 'threshold', label: 'Failed attempts', type: 'number', default: 10, min: 1 },
      { key: 'windowSeconds', label: 'Within (seconds)', type: 'number', default: 60, min: 1 },
    ],
    describe: (p) =>
      `More than ${p.threshold} failed logins from a single source IP within ${p.windowSeconds} seconds.`,
  },
  port_scan_count: {
    label: 'Port scan detection',
    help: 'Fires when one source IP produces many port scan events in a short window.',
    fields: [
      { key: 'threshold', label: 'Scan events', type: 'number', default: 5, min: 1 },
      { key: 'windowSeconds', label: 'Within (seconds)', type: 'number', default: 30, min: 1 },
    ],
    describe: (p) =>
      `More than ${p.threshold} port scan events from a single source IP within ${p.windowSeconds} seconds.`,
  },
  firewall_block_count: {
    label: 'Firewall block flood',
    help: 'Fires when the firewall denies many connections from one source IP in a short window.',
    fields: [
      { key: 'threshold', label: 'Blocked connections', type: 'number', default: 3, min: 1 },
      { key: 'windowSeconds', label: 'Within (seconds)', type: 'number', default: 300, min: 1 },
    ],
    describe: (p) =>
      `More than ${p.threshold} connections from a single source IP denied by the firewall ` +
      `within ${p.windowSeconds} seconds.`,
  },
  blacklisted_ip: {
    label: 'Blacklisted IP address',
    help: 'Fires when an event involves a known botnet C2 server from the abuse.ch Feodo Tracker blocklist.',
    fields: [
      {
        key: 'matchField',
        label: 'Address to check',
        type: 'select',
        default: 'sourceIP',
        options: [
          { value: 'sourceIP', label: 'Source IP' },
          { value: 'destinationIP', label: 'Destination IP' },
        ],
      },
    ],
    describe: (p) =>
      `Traffic whose ${p.matchField === 'destinationIP' ? 'destination' : 'source'} IP ` +
      'appears on the Feodo Tracker botnet C2 blocklist.',
  },
  malware_signature_any: {
    label: 'Malware signature detected',
    help: 'Fires on any event carrying a known malware signature. No extra settings.',
    fields: [],
    describe: () => 'An event carrying a known malware signature was detected on the network.',
  },
};

// Plain-English summary of a condition. Used to keep the Description field in
// step with the detection settings until an admin writes their own wording.
const describeCondition = (type, params) => RULE_TYPES[type]?.describe(params) || '';

const defaultParams = (type) =>
  Object.fromEntries(RULE_TYPES[type].fields.map((f) => [f.key, f.default]));

const buildCondition = (type, params) => {
  const condition = { type };
  for (const f of RULE_TYPES[type].fields) {
    condition[f.key] = f.type === 'number' ? Number(params[f.key]) : params[f.key];
  }
  return condition;
};

// Existing rules may use a type the guided form doesn't know (someone added an
// evaluator without updating this file). Those open in the JSON editor so the
// form can never destroy a condition it doesn't understand.
const deriveConditionState = (condition) => {
  const type = condition?.type;
  const text = JSON.stringify(condition || { type: 'malware_signature_any' }, null, 2);
  if (!type || !RULE_TYPES[type]) {
    return { type: 'malware_signature_any', params: {}, advanced: Boolean(condition), text };
  }
  const params = {};
  for (const f of RULE_TYPES[type].fields) {
    params[f.key] = condition[f.key] ?? f.default;
  }
  return { type, params, advanced: false, text };
};

// Inline form component. Could live in its own file but it's only used here.
const RuleForm = ({ initial, onClose, onSaved }) => {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  // The description is generated from the detection settings until the admin
  // writes their own. An existing rule's wording already counts as theirs, so
  // opening a rule to edit it never silently rewrites the description.
  const [descriptionEdited, setDescriptionEdited] = useState(Boolean(initial?.description));
  const [severity, setSeverity] = useState(initial?.severity || 'medium');
  const [isActive, setIsActive] = useState(initial?.isActive !== false);
  const derived = deriveConditionState(initial?.condition);
  const [conditionType, setConditionType] = useState(derived.type);
  const [params, setParams] = useState(derived.params);
  const [advanced, setAdvanced] = useState(derived.advanced);
  const [conditionText, setConditionText] = useState(derived.text);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const activeType = RULE_TYPES[conditionType];
  const preview = advanced ? conditionText : JSON.stringify(buildCondition(conditionType, params));

  // Regenerate the description whenever the detection settings change, for as
  // long as it is still generated. This also runs when the form opens, so a new
  // rule starts with wording already filled in rather than an empty box. JSON
  // mode is skipped: the hand-edited condition may not match conditionType.
  useEffect(() => {
    if (descriptionEdited || advanced) return;
    setDescription(describeCondition(conditionType, params));
  }, [conditionType, params, descriptionEdited, advanced]);

  // Switching modes carries the current condition across rather than resetting
  // it, so an admin can start in the form and fine-tune the JSON (or back).
  const toggleAdvanced = () => {
    setError('');
    if (!advanced) {
      setConditionText(JSON.stringify(buildCondition(conditionType, params), null, 2));
      setAdvanced(true);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(conditionText);
    } catch {
      setError('Fix the JSON before switching back to the guided form.');
      return;
    }
    if (!RULE_TYPES[parsed?.type]) {
      setError('That detection type has no guided form yet — keep editing it as JSON.');
      return;
    }
    const next = deriveConditionState(parsed);
    setConditionType(next.type);
    setParams(next.params);
    setAdvanced(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    let condition;
    if (advanced) {
      try {
        condition = JSON.parse(conditionText);
      } catch {
        setError('Condition must be valid JSON');
        return;
      }
    } else {
      // Numbers come out of <input type="number"> as strings, and an empty
      // field reads as "". Reject those here so the analyzer never receives a
      // threshold of NaN, which would make the rule quietly never fire.
      for (const f of activeType.fields.filter((x) => x.type === 'number')) {
        const value = Number(params[f.key]);
        if (!Number.isFinite(value) || value < f.min) {
          setError(`${f.label} must be a number of at least ${f.min}.`);
          return;
        }
      }
      condition = buildCondition(conditionType, params);
    }

    setSaving(true);
    try {
      const body = { name, description, severity, isActive, condition };
      if (initial) {
        await api.patch(`/rules/${initial._id}`, body);
      } else {
        await api.post('/rules', body);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded p-6 w-full max-w-lg">
        <h3 className="text-lg font-semibold text-white mb-4">
          {initial ? 'Edit rule' : 'New rule'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="p-2 rounded bg-red-900/40 border border-red-700 text-red-200 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-300 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                // Emptying the box hands control back to the generator.
                setDescriptionEdited(e.target.value.trim() !== '');
              }}
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
            />
            {!descriptionEdited && (
              <p className="text-xs text-slate-500 mt-1">
                Written from the detection type. Type your own to replace it.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Active</label>
              <select
                value={isActive ? 'yes' : 'no'}
                onChange={(e) => setIsActive(e.target.value === 'yes')}
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          <div className="pt-1 border-t border-slate-700">
            <div className="flex items-center justify-between mb-2 mt-3">
              <span className="text-sm font-medium text-slate-200">Detection condition</span>
              <button
                type="button"
                onClick={toggleAdvanced}
                className="text-xs text-sky-400 hover:text-sky-300 hover:underline"
              >
                {advanced ? 'Use guided form' : 'Edit as JSON'}
              </button>
            </div>

            {advanced ? (
              <>
                <textarea
                  value={conditionText}
                  onChange={(e) => setConditionText(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                />
                <p className="text-xs text-slate-500 mt-1">
                  For detection types the guided form does not cover yet.
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Detection type</label>
                  <select
                    value={conditionType}
                    onChange={(e) => {
                      setConditionType(e.target.value);
                      setParams(defaultParams(e.target.value));
                    }}
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                  >
                    {Object.entries(RULE_TYPES).map(([value, def]) => (
                      <option key={value} value={value}>{def.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">{activeType.help}</p>
                </div>

                {activeType.fields.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {activeType.fields.map((f) => (
                      <div key={f.key}>
                        <label className="block text-sm text-slate-300 mb-1">{f.label}</label>
                        {f.type === 'select' ? (
                          <select
                            value={params[f.key]}
                            onChange={(e) => setParams({ ...params, [f.key]: e.target.value })}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                          >
                            {f.options.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            min={f.min}
                            value={params[f.key]}
                            onChange={(e) => setParams({ ...params, [f.key]: e.target.value })}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-slate-500 mt-2 font-mono break-all">
              Saved as: <span className="text-slate-400">{preview}</span>
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:bg-slate-600 text-white"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Rules;
