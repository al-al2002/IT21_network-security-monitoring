// controllers/eventController.js
// Two endpoints:
//   GET /api/events        - paginated, filterable list of events
//   GET /api/events/stats  - simple counts (used by the dashboard)
//
// Why put filtering/pagination in the controller instead of the route?
//   - Routes should be thin glue
//   - The filter logic is non-trivial and benefits from being testable
//   - When Phase 5 needs a "summary" endpoint, it'll naturally live here too

const Event = require('../models/Event');

// GET /api/events
// Query params (all optional):
//   page          - 1-indexed, default 1
//   limit         - default 50, max 200
//   eventType     - filter to one type
//   status        - filter to "normal" or "flagged"
//   severity      - if a threat references this event, optionally show its severity
//   from / to     - ISO date strings for a timestamp range
const listEvents = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);

    // Build the filter object dynamically — only include fields the
    // client actually sent. An empty object matches everything.
    const filter = {};
    if (req.query.eventType) filter.eventType = req.query.eventType;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
      if (req.query.to) filter.timestamp.$lte = new Date(req.query.to);
    }

    // Count + find in parallel. Mongoose will use the indexes we
    // declared in the Event model (status+timestamp, eventType+sourceIP).
    const [total, events] = await Promise.all([
      Event.countDocuments(filter),
      Event.find(filter)
        .sort({ timestamp: -1 })   // newest first
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch events', error: err.message });
  }
};

// GET /api/events/stats
// Returns a small summary used by the dashboard's summary cards.
// Cheap to compute thanks to the indexes.
const getStats = async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const [totalToday, flaggedToday, totalAll] = await Promise.all([
      Event.countDocuments({ timestamp: { $gte: since } }),
      Event.countDocuments({ timestamp: { $gte: since }, status: 'flagged' }),
      Event.countDocuments({}),
    ]);
    res.json({ totalToday, flaggedToday, totalAll });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch stats', error: err.message });
  }
};

module.exports = { listEvents, getStats };
