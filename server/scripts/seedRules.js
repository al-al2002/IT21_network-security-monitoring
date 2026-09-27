// scripts/seedRules.js
// Inserts the default detection rules. Idempotent — re-running it
// updates the existing rules by name rather than creating duplicates.
//
// Run with:  node scripts/seedRules.js
//
// Rule structure:
//   {
//     name:        "Failed Login Attempts",
//     description: "More than 5 failed logins from a single IP in 60 seconds",
//     condition:   { type: "failed_login_count", threshold: 5, windowSeconds: 60 },
//     severity:    "high",
//     isActive:    true,
//   }
//
// The analyzer (services/analyzer.js) interprets these conditions.
//
// Names and thresholds here match the rules the running system actually uses,
// so re-seeding a fresh database reproduces the same detections rather than a
// differently-tuned set. Edit a rule in the Rules page and it will differ from
// this file until the change is copied back here.

require('dotenv').config();
const mongoose = require('mongoose');
const Rule = require('../models/Rule');

const DEFAULT_RULES = [
  {
    name: 'Failed Login Attempts',
    description: 'More than 5 failed logins from a single source IP within 60 seconds.',
    condition: { type: 'failed_login_count', threshold: 5, windowSeconds: 60 },
    severity: 'high',
    isActive: true,
  },
  {
    name: 'Blacklisted IP',
    description: 'Traffic originating from a known botnet C2 server on the abuse.ch Feodo Tracker blocklist.',
    condition: { type: 'blacklisted_ip', matchField: 'sourceIP' },
    severity: 'critical',
    isActive: true,
  },
  {
    name: 'Port Scan Activity',
    description: 'More than 3 port_scan events from a single IP within 60 seconds.',
    condition: { type: 'port_scan_count', threshold: 3, windowSeconds: 60 },
    severity: 'medium',
    isActive: true,
  },
  {
    name: 'Firewall Block Flood',
    description: 'More than 3 connections from a single source IP denied by the firewall within 5 minutes.',
    condition: { type: 'firewall_block_count', threshold: 3, windowSeconds: 300 },
    severity: 'high',
    isActive: true,
  },
  {
    name: 'Malware Signature',
    description: 'A malware_signature event was detected on the network.',
    condition: { type: 'malware_signature_any' },
    severity: 'critical',
    isActive: true,
  },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[seed-rules] connected');

    for (const r of DEFAULT_RULES) {
      // Upsert by name. If a rule with this name exists, update it;
      // otherwise create it. This means re-running the script is safe.
      await Rule.findOneAndUpdate(
        { name: r.name },
        { $set: r },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`[seed-rules] upserted: ${r.name}`);
    }

    console.log(`\n[seed-rules] ${DEFAULT_RULES.length} rule(s) in database`);
  } catch (err) {
    console.error('[seed-rules] failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
