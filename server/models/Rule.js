// models/Rule.js
// A detection rule. The analysis engine (Phase 3) reads the active rules
// from this collection on each event and decides whether the event should
// be flagged as a Threat.
//
// We store the condition as a STRUCTURED object (not a free-text string)
// so the analyzer can interpret it without parsing natural language.
//
// Example condition:
//   {
//     "type": "failed_login_count",
//     "sourceIP": true,        // group by sourceIP
//     "threshold": 10,         // fire when count >=
//     "windowSeconds": 60      // within this rolling time window
//   }
//
// Another example:
//   {
//     "type": "blacklisted_ip",
//     "matchField": "sourceIP" // the IP must be on the Feodo Tracker blocklist
//   }

const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 500,
      default: '',
    },
    condition: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      // Indexed so the analyzer's "load all active rules" query is O(1) lookup.
    },
  },
  {
    timestamps: true,
  }
);

ruleSchema.index({ isActive: 1 });

module.exports = mongoose.model('Rule', ruleSchema);
