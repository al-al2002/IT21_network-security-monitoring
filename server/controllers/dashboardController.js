// controllers/dashboardController.js
// Endpoints that power the dashboard charts. All do their work
// in MongoDB using the aggregation framework, so we never have to
// stream thousands of events to the client just to count them.
//
// Endpoints:
//   GET /api/dashboard/timeseries?bucketMinutes=5&hours=1
//      -> [{ bucket: "HH:MM", count: 12 }, ...]
//   GET /api/dashboard/top-sources?limit=5&hours=24
//      -> [{ sourceIP: "x.x.x.x", count: 42 }, ...]

const Event = require('../models/Event');

const TIMESERIES_DEFAULTS = { bucketMinutes: 5, hours: 1 };
const TOPSOURCES_DEFAULTS = { limit: 5, hours: 24 };

// GET /api/dashboard/timeseries
// Returns event counts bucketed by time. The frontend uses this
// to draw the area chart.
const getTimeseries = async (req, res) => {
  try {
    const bucketMinutes = Math.max(1, parseInt(req.query.bucketMinutes) || TIMESERIES_DEFAULTS.bucketMinutes);
    const hours = Math.max(1, parseInt(req.query.hours) || TIMESERIES_DEFAULTS.hours);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Convert bucketMinutes to milliseconds for the $dateTrunc unit.
    // MongoDB's $dateTrunc lets us round each timestamp down to the
    // nearest bucket boundary, then $group by that boundary.
    const buckets = await Event.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: {
            $dateTrunc: { date: '$timestamp', unit: 'minute', binSize: bucketMinutes },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill in zero-count buckets so the chart has a continuous x-axis.
    // Without this, a quiet period would create gaps in the line.
    const filled = [];
    const startMs = Math.floor(since.getTime() / (bucketMinutes * 60 * 1000)) * (bucketMinutes * 60 * 1000);
    const endMs = Date.now();
    const byTs = new Map(buckets.map((b) => [b._id.getTime(), b.count]));
    for (let t = startMs; t <= endMs; t += bucketMinutes * 60 * 1000) {
      filled.push({
        bucket: new Date(t).toISOString(),
        count: byTs.get(t) || 0,
      });
    }

    res.json({ bucketMinutes, hours, series: filled });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch timeseries', error: err.message });
  }
};

// GET /api/dashboard/top-sources
// Returns the top N source IPs by event count over the last N hours.
const getTopSources = async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || TOPSOURCES_DEFAULTS.limit);
    const hours = Math.max(1, parseInt(req.query.hours) || TOPSOURCES_DEFAULTS.hours);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const top = await Event.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: '$sourceIP', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    res.json({
      hours,
      top: top.map((t) => ({ sourceIP: t._id, count: t.count })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch top sources', error: err.message });
  }
};

module.exports = { getTimeseries, getTopSources };
