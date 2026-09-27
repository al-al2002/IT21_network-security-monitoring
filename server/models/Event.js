// models/Event.js
// A single security event observation. Produced by one of the event
// sources (see services/eventIngest.js):
//   - the CIC-IDS2017 replay  (real captured flows, services/datasetReplay.js)
//   - NetGuard's own login endpoint (real login attempts, authController.js)
//   - the fallback simulator  (synthetic, services/eventSimulator.js)
// This collection is HIGH WRITE VOLUME — keep the schema lean.
//
// Lifecycle:
//   - An event source creates a new Event
//   - Analysis engine (Phase 3) may mark it as "flagged" if a rule triggers
//   - The event may be referenced by one or more Threats (via eventIds)

const net = require('net');
const mongoose = require('mongoose');

// IPv4 or IPv6. Real login events can arrive over IPv6 (e.g. "::1" when
// the browser reaches the dev server through localhost on Windows).
const ipField = {
  type: String,
  required: true,
  validate: {
    validator: (v) => net.isIP(v) !== 0,
    message: (props) => `Invalid IP address: ${props.value}`,
  },
};

const eventSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      // Indexed below (descending) so the dashboard's "newest first"
      // query is fast even with millions of documents.
    },
    sourceIP: { ...ipField },
    destinationIP: { ...ipField },
    eventType: {
      type: String,
      required: true,
      // firewall_block records a connection the perimeter firewall refused.
      // NetGuard does not block anything itself — it ingests the firewall's
      // logs, the same way a real monitoring system would.
      enum: ['login_attempt', 'port_scan', 'traffic', 'malware_signature', 'firewall_block'],
    },
    protocol: {
      type: String,
      // Optional because not all event types have a clear protocol
      // (e.g. "traffic" might be a generic flow record).
      enum: ['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'OTHER'],
      default: 'OTHER',
    },
    port: {
      type: Number,
      min: 0,
      max: 65535,
      // Not required — traffic events may not be port-specific.
    },
    // Free-form structured payload from the source. e.g. for a
    // login_attempt, this might be { "username": "admin", "success": false };
    // for a replayed flow it carries the CIC-IDS2017 label and flow ID.
    // Mongoose Mixed gives flexibility without a rigid sub-schema.
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['normal', 'flagged'],
      default: 'normal',
      // Index on this lets us count "flagged events" cheaply for the dashboard.
    },
  },
  {
    timestamps: false, // we use the explicit `timestamp` field above
  }
);

// Indexes — chosen based on the queries we'll run most often:
//   1. "Show me the latest 50 events"            -> sort by timestamp desc
//   2. "How many flagged events today?"          -> filter by status, then timestamp
//   3. "All login_attempts from this source IP"  -> filter by eventType, sourceIP
//   4. "Top source IPs by event count"           -> group by sourceIP
eventSchema.index({ timestamp: -1 });
eventSchema.index({ status: 1, timestamp: -1 });
eventSchema.index({ eventType: 1, sourceIP: 1 });

// TTL index — opt-in. Set EVENT_RETENTION_DAYS (e.g. 7) and MongoDB deletes
// events older than that automatically. The replay adds ~50,000 events a day
// while running, which would fill a free 512 MB Atlas cluster in a few weeks.
// Note the index lives in the database, not the app: once created, it keeps
// deleting old events for every server using that database, and unsetting the
// variable does not remove it (drop the "timestamp_1" index in Atlas for that).
const RETENTION_DAYS = parseFloat(process.env.EVENT_RETENTION_DAYS);
if (RETENTION_DAYS > 0) {
  eventSchema.index({ timestamp: 1 }, { expireAfterSeconds: Math.round(RETENTION_DAYS * 86400) });
}

module.exports = mongoose.model('Event', eventSchema);
