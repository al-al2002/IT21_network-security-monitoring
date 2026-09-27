import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import LoadingState from '../components/LoadingState';

const SEVERITY_COLORS = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const formatClock = (value) => {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [eventsStats, setEventsStats] = useState({ totalToday: 0, flaggedToday: 0, totalAll: 0 });
  const [incidentStats, setIncidentStats] = useState({ open: 0, total: 0, byStatus: [] });
  const [threatStats, setThreatStats] = useState({ total: 0, bySeverity: [] });
  const [timeseries, setTimeseries] = useState([]);
  const [topSources, setTopSources] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [eventSummary, incidentSummary, threatSummary, seriesData, sourceData] = await Promise.all([
          api.get('/events/stats'),
          api.get('/incidents/stats'),
          api.get('/threats/stats'),
          api.get('/dashboard/timeseries?bucketMinutes=15&hours=12'),
          api.get('/dashboard/top-sources?limit=5&hours=24'),
        ]);

        setEventsStats(eventSummary);
        setIncidentStats(incidentSummary);
        setThreatStats(threatSummary);
        setTimeseries(seriesData.series || []);
        setTopSources(sourceData.top || []);
      } catch (err) {
        setError(err.message || 'Failed to load dashboard metrics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const severityData = useMemo(() => {
    const counts = Object.fromEntries((threatStats.bySeverity || []).map((entry) => [entry._id, entry.count]));
    return ['low', 'medium', 'high', 'critical'].map((level) => ({
      name: level,
      value: counts[level] || 0,
      color: SEVERITY_COLORS[level],
    }));
  }, [threatStats]);

  const pieTotal = severityData.reduce((sum, entry) => sum + entry.value, 0);
  const systemStatus = incidentStats.open === 0
    ? { label: 'Nominal', tone: 'text-emerald-300 bg-emerald-900/30 border-emerald-700' }
    : incidentStats.open <= 2
      ? { label: 'Watch', tone: 'text-amber-300 bg-amber-900/30 border-amber-700' }
      : { label: 'Critical', tone: 'text-red-300 bg-red-900/30 border-red-700' };

  const summaryCards = [
    {
      label: 'Total Events Today',
      value: eventsStats.totalToday,
      accent: 'text-sky-300',
      meta: `${eventsStats.flaggedToday} flagged in last 24h`,
    },
    {
      label: 'Active Threats',
      value: threatStats.total,
      accent: 'text-amber-300',
      meta: 'Across all severities',
    },
    {
      label: 'Open Incidents',
      value: incidentStats.open,
      accent: 'text-red-300',
      meta: `${incidentStats.total} total incidents`,
    },
    {
      label: 'System Status',
      value: systemStatus.label,
      accent: systemStatus.label === 'Nominal' ? 'text-emerald-300' : 'text-amber-300',
      meta: systemStatus.label === 'Critical' ? 'Escalation required' : 'Monitoring within threshold',
    },
  ];

  if (loading) {
    return <LoadingState label="Loading dashboard" />;
  }

  if (error) {
    return <div className="text-red-300">Error: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Operations overview</p>
          <div className="flex items-center gap-3 mt-2">
            <img src="/netguard.png" alt="NetGuard logo" className="h-16 w-56 object-contain" />
            <h2 className="text-2xl font-semibold text-white">Security Dashboard</h2>
          </div>
        </div>
        <div className={`px-3 py-1.5 border rounded text-sm ${systemStatus.tone}`}>
          {systemStatus.label}
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-lg shadow-slate-950/20">
            <div className="text-xs uppercase tracking-wide text-slate-400">{card.label}</div>
            {/* tabular-nums gives every digit the same width, so these counts
                stop jittering sideways as new events update them. */}
            <div className={`mt-3 text-3xl font-semibold tabular-nums ${card.accent}`}>
              {card.value}
            </div>
            <div className="mt-2 text-xs text-slate-400">{card.meta}</div>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-[1.7fr_1fr] gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Events over time</h3>
            <span className="text-xs text-slate-400">Last 12 hours</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeseries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eventsFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tickFormatter={formatClock} stroke="#94a3b8" fontSize={11} minTickGap={18} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px' }}
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                />
                <Area type="monotone" dataKey="count" stroke="#38bdf8" fill="url(#eventsFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Threat severity</h3>
            <span className="text-xs text-slate-400">{pieTotal} total</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={90} paddingAngle={3}>
                  {severityData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [value, 'Threats']}
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {severityData.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between rounded bg-slate-900/50 px-2 py-1.5">
                <span className="flex items-center gap-2 text-slate-200">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
                <span className="text-slate-300 tabular-nums">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Top source IPs</h3>
          <span className="text-xs text-slate-400">Last 24 hours</span>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topSources} layout="vertical" margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} stroke="#94a3b8" fontSize={11} />
              <YAxis type="category" dataKey="sourceIP" width={110} stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px' }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="#a78bfa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
