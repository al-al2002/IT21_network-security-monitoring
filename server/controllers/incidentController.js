// controllers/incidentController.js
// CRUD for incidents plus the action-log append endpoint.
//
// Endpoints:
//   POST   /api/incidents              - create from a threatId
//   GET    /api/incidents             - list, filterable
//   GET    /api/incidents/:id         - one, with linked threat and user populated
//   PATCH  /api/incidents/:id         - update status / assignment / title
//                                        (resolving requires { resolution })
//   POST   /api/incidents/:id/actions - append to actionLog
//
// Important: every status change MUST also append to the actionLog,
// so the audit trail is always in sync. We do this in the controller
// rather than relying on the client to do both, so a malicious or
// buggy client can't desync the two.

const mongoose = require('mongoose');
const Incident = require('../models/Incident');
const Threat = require('../models/Threat');
const User = require('../models/User');
const { emitThreatEscalated } = require('./threatController');

// actionLog entries are capped at 200 characters (see models/Incident.js).
const RESOLUTION_MAX = 1000;
const logExcerpt = (text, max = 180) => (text.length > max ? `${text.slice(0, max)}…` : text);

const listIncidents = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;

    const [total, incidents] = await Promise.all([
      Incident.countDocuments(filter),
      Incident.find(filter)
        .populate('assignedTo', 'name email role')   // expand the user reference
        .populate('threatId', 'severity description ruleTriggered')  // expand the threat
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({
      incidents,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch incidents', error: err.message });
  }
};

const getIncident = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid incident id' });
    }
    const incident = await Incident.findById(req.params.id)
      .populate('assignedTo', 'name email role')
      .populate('threatId')
      .populate('actionLog.by', 'name email role');
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    res.json({ incident });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch incident', error: err.message });
  }
};

// An analyst may only work the incidents assigned to them; an admin may work
// any of them. Returns null when allowed, or the reason to reject with.
//
// Why ownership rather than role alone: without this, any analyst could change
// the status or notes of an incident another analyst is investigating, and the
// action log would be the only trace. Assignment is what makes an incident
// somebody's responsibility, so it is also what grants the right to edit it.
const denyReason = (user, incident) => {
  if (user.role === 'admin') return null;
  if (!incident.assignedTo) {
    return 'This incident is not assigned to anyone. Ask an admin to assign it to you first.';
  }
  if (incident.assignedTo.toString() !== user._id.toString()) {
    return 'You can only update incidents assigned to you.';
  }
  return null;
};

// POST /api/incidents
// Body: { threatId, title, description }
// The first actionLog entry is auto-created ("Incident created").
const createIncident = async (req, res) => {
  try {
    const { threatId, title, description } = req.body;
    if (!threatId || !title) {
      return res.status(400).json({ message: 'threatId and title are required' });
    }
    if (!mongoose.isValidObjectId(threatId)) {
      return res.status(400).json({ message: 'Invalid threatId' });
    }

    // Confirm the threat exists. We don't want incidents pointing at
    // deleted threats.
    const threat = await Threat.findById(threatId);
    if (!threat) return res.status(404).json({ message: 'Threat not found' });

    // One incident per threat. A second one would split the investigation
    // across two records; reopen the existing incident instead.
    const existing = await Incident.findOne({ threatId }).select('_id');
    if (existing) {
      return res.status(409).json({
        message: 'This threat already has an incident.',
        incidentId: existing._id,
      });
    }

    // The creator becomes the assignee. Without this an analyst could raise an
    // incident and then be locked out of their own work, since editing now
    // requires assignment. An admin can reassign it afterwards.
    const incident = await Incident.create({
      threatId,
      title,
      description: description || '',
      status: 'open',
      assignedTo: req.user._id,
      actionLog: [
        { action: 'Incident created', by: req.user._id, timestamp: new Date() },
        { action: `Assigned to ${req.user.name}`, by: req.user._id, timestamp: new Date() },
      ],
    });

    // Opening an incident is escalating the threat, so keep its status in
    // step — otherwise the Threats list still shows it as "new".
    const justEscalated = threat.status !== 'escalated';
    if (justEscalated) {
      threat.status = 'escalated';
      await threat.save();
    }

    const populated = await Incident.findById(incident._id)
      .populate('assignedTo', 'name email role')
      .populate('threatId', 'severity description ruleTriggered');

    // Broadcast so the dashboard "open incidents" count can update live.
    const io = req.app.get('io');
    if (io) {
      io.emit('incident:new', populated);
      if (justEscalated) {
        io.emit('threat:updated', threat);
        emitThreatEscalated(io, threat, req.user);
      }
    }

    res.status(201).json({ incident: populated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create incident', error: err.message });
  }
};

// PATCH /api/incidents/:id
// Body: { status?, assignedTo?, title?, description?, resolution? }
// resolution is required when status becomes "resolved".
// Every change is logged to actionLog.
const updateIncident = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid incident id' });
    }
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    const denied = denyReason(req.user, incident);
    if (denied) return res.status(403).json({ message: denied });

    const { status, assignedTo, title, description, resolution } = req.body;
    const logEntries = [];
    let newlyAssignedTo = null;

    if (status && !['open', 'investigating', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    if (status && status !== incident.status) {
      // A resolved incident has to say how it was resolved — without that the
      // record is useless for review or reporting.
      const note = typeof resolution === 'string' ? resolution.trim() : '';
      if (status === 'resolved' && !note) {
        return res.status(400).json({ message: 'A resolution note is required to resolve an incident' });
      }
      if (note.length > RESOLUTION_MAX) {
        return res.status(400).json({ message: `Resolution note must be at most ${RESOLUTION_MAX} characters` });
      }

      logEntries.push({ action: `Status changed: ${incident.status} -> ${status}`, by: req.user._id });
      if (status === 'resolved') {
        incident.resolvedAt = new Date();
        incident.resolution = note;
        logEntries.push({ action: `Resolution: ${logExcerpt(note)}`, by: req.user._id });
      } else if (incident.status === 'resolved') {
        // Reopened: it is no longer resolved, so clear when and how it was.
        // The earlier resolution stays in the action log.
        incident.resolvedAt = undefined;
        incident.resolution = '';
      }
      incident.status = status;
    }
    if (assignedTo !== undefined) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Only admins can assign incidents' });
      }
      if (assignedTo === null) {
        if (incident.assignedTo) {
          logEntries.push({ action: 'Unassigned', by: req.user._id });
        }
        incident.assignedTo = null;
      } else {
        if (!mongoose.isValidObjectId(assignedTo)) {
          return res.status(400).json({ message: 'Invalid assignedTo' });
        }
        const user = await User.findById(assignedTo);
        if (!user) return res.status(404).json({ message: 'Assigned user not found' });
        if (!incident.assignedTo || incident.assignedTo.toString() !== assignedTo) {
          logEntries.push({ action: `Assigned to ${user.name}`, by: req.user._id });
          // Tell the assignee, and only the assignee. Skipped when an admin
          // assigns something to themselves — they already know.
          if (assignedTo !== req.user._id.toString()) {
            newlyAssignedTo = assignedTo;
          }
        }
        incident.assignedTo = assignedTo;
      }
    }
    if (title && title !== incident.title) {
      incident.title = title;
    }
    if (description !== undefined && description !== incident.description) {
      incident.description = description;
    }

    // Push all log entries in one operation
    if (logEntries.length > 0) {
      incident.actionLog.push(...logEntries);
    }

    await incident.save();

    const populated = await Incident.findById(incident._id)
      .populate('assignedTo', 'name email role')
      .populate('threatId', 'severity description ruleTriggered')
      .populate('actionLog.by', 'name email role');

    const io = req.app.get('io');
    if (io) {
      io.emit('incident:updated', populated);

      // Room-targeted: reaches the assigned analyst's browsers only.
      if (newlyAssignedTo) {
        io.to(`user:${newlyAssignedTo}`).emit('incident:assigned', {
          _id: populated._id,
          title: populated.title,
          status: populated.status,
          severity: populated.threatId?.severity || null,
          assignedBy: req.user.name,
        });
      }
    }

    res.json({ incident: populated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update incident', error: err.message });
  }
};

// POST /api/incidents/:id/actions
// Body: { action: "free text describing what was done" }
const addAction = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid incident id' });
    }
    const { action } = req.body;
    if (!action || typeof action !== 'string' || !action.trim()) {
      return res.status(400).json({ message: 'action text is required' });
    }

    // Load first so ownership can be checked before anything is written.
    const existing = await Incident.findById(req.params.id).select('assignedTo');
    if (!existing) return res.status(404).json({ message: 'Incident not found' });

    const denied = denyReason(req.user, existing);
    if (denied) return res.status(403).json({ message: denied });

    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      { $push: { actionLog: { action: action.trim(), by: req.user._id, timestamp: new Date() } } },
      { new: true }
    )
      .populate('assignedTo', 'name email role')
      .populate('threatId', 'severity description ruleTriggered')
      .populate('actionLog.by', 'name email role');

    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    const io = req.app.get('io');
    if (io) io.emit('incident:updated', incident);

    res.json({ incident });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add action', error: err.message });
  }
};

// GET /api/incidents/stats - simple counts for the dashboard
const getStats = async (req, res) => {
  try {
    const [byStatus, total, open] = await Promise.all([
      Incident.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Incident.countDocuments({}),
      Incident.countDocuments({ status: { $in: ['open', 'investigating'] } }),
    ]);
    res.json({ total, open, byStatus });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch incident stats', error: err.message });
  }
};

module.exports = { listIncidents, getIncident, createIncident, updateIncident, addAction, getStats };
