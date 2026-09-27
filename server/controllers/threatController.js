// controllers/threatController.js
// Three endpoints for threats:
//   GET    /api/threats        - list with filters
//   GET    /api/threats/:id    - one threat, populated with the linked events
//   PATCH  /api/threats/:id    - update status (new | reviewed | escalated)

const mongoose = require('mongoose');
const Threat = require('../models/Threat');
const Event = require('../models/Event');
const Incident = require('../models/Incident');

// Escalation means "an analyst needs to act on this", so it gets its own
// event rather than being buried in the general update stream. Shared with
// incidentController, since opening an incident also escalates its threat.
const emitThreatEscalated = (io, threat, user) => {
  io.emit('threat:escalated', {
    _id: threat._id,
    description: threat.description,
    severity: threat.severity,
    ruleTriggered: threat.ruleTriggered,
    escalatedBy: user.name,
    escalatedById: user._id.toString(),
  });
};

const listThreats = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);

    const filter = {};
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.from || req.query.to) {
      filter.detectedAt = {};
      if (req.query.from) filter.detectedAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.detectedAt.$lte = new Date(req.query.to);
    }

    const [total, threats] = await Promise.all([
      Threat.countDocuments(filter),
      Threat.find(filter)
        .sort({ detectedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({
      threats,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch threats', error: err.message });
  }
};

// Get one threat, with the linked events and its incident (if any) inlined
// so the detail page doesn't have to make more requests.
const getThreat = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid threat id' });
    }
    const threat = await Threat.findById(req.params.id);
    if (!threat) return res.status(404).json({ message: 'Threat not found' });

    const [events, incident] = await Promise.all([
      Event.find({ _id: { $in: threat.eventIds } }).sort({ timestamp: 1 }),
      Incident.findOne({ threatId: threat._id }).sort({ createdAt: 1 }).select('_id title status'),
    ]);
    res.json({ threat, events, incident });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch threat', error: err.message });
  }
};

// PATCH /api/threats/:id
// Body: { status: "reviewed" | "escalated" | "new" }
// Only the status is updatable here. Other fields (severity, events)
// are derived from the analysis and shouldn't be changed manually.
const updateThreat = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid threat id' });
    }
    const { status } = req.body;
    const allowed = ['new', 'reviewed', 'escalated'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of ${allowed.join(', ')}` });
    }
    // Load first so we can tell a real escalation from a repeated save of an
    // already-escalated threat — analysts should be alerted once, on the
    // transition, not every time somebody touches the record.
    const threat = await Threat.findById(req.params.id);
    if (!threat) return res.status(404).json({ message: 'Threat not found' });

    const justEscalated = status === 'escalated' && threat.status !== 'escalated';
    threat.status = status;
    await threat.save();

    // Broadcast so other open clients (e.g. dashboard) can update.
    const io = req.app.get('io');
    if (io) {
      io.emit('threat:updated', threat);
      if (justEscalated) emitThreatEscalated(io, threat, req.user);
    }

    res.json({ threat });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update threat', error: err.message });
  }
};

// GET /api/threats/stats
// Returns the counts by severity and status for the dashboard.
const getThreatStats = async (req, res) => {
  try {
    const [bySeverity, byStatus, total] = await Promise.all([
      Threat.aggregate([
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      Threat.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Threat.countDocuments({}),
    ]);
    res.json({ total, bySeverity, byStatus });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch threat stats', error: err.message });
  }
};

module.exports = { listThreats, getThreat, updateThreat, getThreatStats, emitThreatEscalated };
