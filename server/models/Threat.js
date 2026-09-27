// models/Threat.js
// A threat is created by the analysis engine when a Rule's condition matches.
// It is a record of "rule X fired, here are the events that caused it".
//
// Threats are an aggregation result — they don't generate new raw data,
// they point at Events and explain why those events are dangerous.
//
// Lifecycle:
//   - created by analyzer with status: "new"
//   - analyst reviews and either sets to "reviewed" or "escalated"
//   - if escalated, the analyst usually also creates an Incident

const mongoose = require('mongoose');

const threatSchema = new mongoose.Schema(
  {
    // Array of Event references. An array because a single rule firing
    // might involve many events (e.g. "10 failed logins from this IP").
    eventIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
      },
    ],
    ruleTriggered: {
      // We could use a ref to Rule, but storing the rule's name directly
      // is friendlier for the UI ("Brute Force Login" rather than an
      // ObjectId). If the rule is later renamed, historical threats
      // still show the name they were detected with.
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true,
      // Indexed for the dashboard's "threats by severity" donut chart.
    },
    description: {
      type: String,
      required: true,
      // Human-readable: "10 failed logins from 192.168.1.50 in 60 seconds"
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['new', 'reviewed', 'escalated'],
      default: 'new',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for the common dashboard queries:
//   "Latest 50 threats"           -> sort by detectedAt desc
//   "Count threats by severity"   -> group by severity
//   "All new threats to review"   -> filter by status, sort by detectedAt desc
threatSchema.index({ detectedAt: -1 });
threatSchema.index({ severity: 1 });
threatSchema.index({ status: 1, detectedAt: -1 });

module.exports = mongoose.model('Threat', threatSchema);
