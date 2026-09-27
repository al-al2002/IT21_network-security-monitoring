import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import LoadingState from '../components/LoadingState';

const Reports = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/incidents?limit=200');
        setIncidents(data.incidents || []);
      } catch (err) {
        console.error('Failed to fetch incidents for reports:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredIncidents = useMemo(() => {
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).setHours(23, 59, 59, 999);

    return incidents.filter((incident) => {
      const time = new Date(incident.createdAt).getTime();
      return time >= fromTime && time <= toTime;
    });
  }, [incidents, from, to]);

  const openCount = filteredIncidents.filter((incident) => incident.status === 'open').length;
  const investigatingCount = filteredIncidents.filter((incident) => incident.status === 'investigating').length;
  const resolvedCount = filteredIncidents.filter((incident) => incident.status === 'resolved').length;

  const exportPdf = () => {
    if (!filteredIncidents.length) {
      alert('No incidents found in the selected date range.');
      return;
    }

    const rows = filteredIncidents
      .map(
        (incident) => `
          <tr>
            <td>${incident.title}</td>
            <td>${incident.status}</td>
            <td>${incident.threatId?.severity || 'unknown'}</td>
            <td>${incident.assignedTo?.name || 'Unassigned'}</td>
            <td>${new Date(incident.createdAt).toLocaleString()}</td>
          </tr>
        `
      )
      .join('');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>NetGuard Incident Summary</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin-bottom: 8px; }
            .meta { color: #475569; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #e2e8f0; }
          </style>
        </head>
        <body>
          <h1>NetGuard Incident Summary</h1>
          <div class="meta">Range: ${from} to ${to}</div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Assigned To</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Reporting</p>
          <h2 className="text-2xl font-semibold text-white mt-1">Incident Reports</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportPdf}
            className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm"
          >
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="grid md:grid-cols-3 gap-4">
          <label className="block text-sm text-slate-300">
            <span className="mb-1 block">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
            />
          </label>
          <label className="block text-sm text-slate-300">
            <span className="mb-1 block">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
            />
          </label>
          <div className="flex items-end">
            <div className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-300">
              {filteredIncidents.length} incidents selected
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Open</div>
          <div className="text-3xl font-semibold text-red-300 mt-2">{openCount}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Investigating</div>
          <div className="text-3xl font-semibold text-amber-300 mt-2">{investigatingCount}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">Resolved</div>
          <div className="text-3xl font-semibold text-emerald-300 mt-2">{resolvedCount}</div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr className="text-left text-slate-400">
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Severity</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Assigned To</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5}><LoadingState label="Loading reports" compact /></td>
                </tr>
              )}
              {!loading && filteredIncidents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No incidents in this range.</td>
                </tr>
              )}
              {filteredIncidents.map((incident) => (
                <tr key={incident._id} className="border-t border-slate-700/50">
                  <td className="px-4 py-2 text-white">{incident.title}</td>
                  <td className="px-4 py-2 text-slate-300">{incident.threatId?.severity || 'unknown'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${
                        incident.status === 'open'
                          ? 'border-red-700 bg-red-900/30 text-red-300'
                          : incident.status === 'investigating'
                            ? 'border-amber-700 bg-amber-900/30 text-amber-300'
                            : 'border-emerald-700 bg-emerald-900/30 text-emerald-300'
                      }`}
                    >
                      {incident.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-300">{incident.assignedTo?.name || 'Unassigned'}</td>
                  <td className="px-4 py-2 text-slate-400">{new Date(incident.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
