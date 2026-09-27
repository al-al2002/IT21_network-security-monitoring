// models/Incident.js
// An incident is the human-tracked response to a threat. While threats
// are auto-generated, incidents require an analyst to act on them.
//
// Lifecycle:
//   - Created from a Threat ("PostgreSQL server is under brute force attack")
//   - Assigned to an analyst (assignedTo)
//   - Status: open -> investigating -> resolved (resolving requires a
//     resolution note; reopening clears it)
//   - Every state change or note is appended to actionLog (immutable timeline)
//
// Why an embedded array for actionLog instead of a separate collection?
//   - actionLog is always loaded with the incident (no extra query)
//   - It's append-only — we never update or delete individual entries
//   - It naturally has a 1:many with the incident, and a small bound
//     (a few hundred entries per incident in practice)
//   For a real production system with thousands of entries per incident,
//   a separate AuditLog collection would scale better.

const mongoose = require('mongoose');

const actionEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, maxlength: 200 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false } // no need for each log entry to have its own ObjectId
);

const incidentSchema = new mongoose.Schema(
  {
    threatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Threat',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved'],
      default: 'open',
      // Indexed for the "filter by status" list view.
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      // Not required on creation — an analyst might claim it later.
    },
    resolvedAt: {
      type: Date,
      // Only set when status moves to "resolved". The controller handles this.
    },
    resolution: {
      // How the incident was resolved: required to move to "resolved",
      // cleared if the incident is reopened. The action log keeps history.
      type: String,
      maxlength: 1000,
      default: '',
    },
    actionLog: {
      type: [actionEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

incidentSchema.index({ status: 1, createdAt: -1 });
incidentSchema.index({ assignedTo: 1, status: 1 });
incidentSchema.index({ threatId: 1 });

module.exports = mongoose.model('Incident', incidentSchema);
