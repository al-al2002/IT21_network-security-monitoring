// services/analyzer.js
// The threat analysis engine. Reads the Rule collection, evaluates
// each active rule against recent events, and creates Threats when
// a rule's condition is satisfied.
//
// Called by services/eventIngest.js after every batch of new events,
// whatever produced them (dataset replay, simulator, or a real login):
//
//   const saved = await Event.insertMany(events);
//   await runAnalysis(saved, io);
//
// Rule types implemented here:
//   - failed_login_count   : N+ failed login_attempts from same IP in time window
//   - blacklisted_ip       : event's source/dest IP is on the Feodo Tracker
//                            botnet C2 blocklist (services/threatIntel.js)
//   - port_scan_count      : N+ port_scan events from same IP in time window
//   - firewall_block_count : N+ connections from same IP denied by the firewall
//   - malware_signature_any: any malware_signature event
//
// To add a new rule type:
//   1. Add a case in evaluateRule below
//   2. Add an example rule to scripts/seedRules.js
//   3. (Optionally) add a UI control in /pages/Rules.jsx in Phase 3 step 4

const Event = require('../models/Event');
const Rule = require('../models/Rule');
const Threat = require('../models/Threat');
const { lookupIp } = require('./threatIntel');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --- Individual rule evaluators --------------------------------------------
// Each returns an array of "matches":
//   [{ eventIds: [ObjectId, ...], description: "..." }]
// or [] if the rule does not fire.

// failed_login_count, port_scan_count and firewall_block_count all ask the
// same question — "did one source IP produce N of these events inside the
// rolling window?" — and differ only in which events they count and how the
// finding reads. One implementation, three thin wrappers below it.
const evalCountBySourceIp = async (rule, { filter, describe }) => {
  const { threshold, windowSeconds } = rule.condition;
  const since = new Date(Date.now() - windowSeconds * 1000);

  // We need to consider not just the new batch, but ALL recent events
  // from the same IP — the rule cares about the rolling window, not
  // just the latest batch.
  const recent = await Event.find({
    ...filter,
    timestamp: { $gte: since },
  }).select('_id sourceIP timestamp');

  // Group by sourceIP and find any group with count >= threshold
  const byIp = new Map();
  for (const e of recent) {
    if (!byIp.has(e.sourceIP)) byIp.set(e.sourceIP, []);
    byIp.get(e.sourceIP).push(e);
  }

  const matches = [];
  for (const [ip, evts] of byIp) {
    if (evts.length < threshold) continue;

    // Dedupe — one threat per burst. A burst is one IP producing these events
    // without going quiet for a full window. If this rule already fired for
    // the IP within one window before the oldest event being counted, these
    // events are the tail of that same burst: attach them to the existing
    // threat instead of raising a new one. (Checking only "fired in the last
    // window" made any burst longer than the window fire twice — once when it
    // crossed the threshold, again when that first threat aged out.)
    const oldest = evts.reduce((min, e) => (e.timestamp < min ? e.timestamp : min), evts[0].timestamp);
    const existing = await Threat.findOne({
      ruleTriggered: rule.name,
      // "from <ip> " — the trailing space stops 10.0.0.1 matching 10.0.0.12
      description: { $regex: `from ${escapeRegex(ip)} ` },
      detectedAt: { $gte: new Date(oldest.getTime() - windowSeconds * 1000) },
    }).sort({ detectedAt: -1 });

    if (existing) {
      const ids = evts.map((e) => e._id);
      await Threat.updateOne({ _id: existing._id }, { $addToSet: { eventIds: { $each: ids } } });
      await Event.updateMany({ _id: { $in: ids } }, { $set: { status: 'flagged' } });
      continue;
    }

    matches.push({
      eventIds: evts.map((e) => e._id),
      description: describe(evts.length, ip, windowSeconds),
    });
  }
  return matches;
};

const evalFailedLoginCount = (rule) =>
  evalCountBySourceIp(rule, {
    filter: { eventType: 'login_attempt', 'rawData.success': false },
    describe: (n, ip, w) => `${n} failed logins from ${ip} in ${w} seconds`,
  });

const evalBlacklistedIp = async (rule, newEvents) => {
  const { matchField } = rule.condition;
  const matches = [];
  for (const e of newEvents) {
    const intel = lookupIp(e[matchField]);
    if (intel) {
      matches.push({
        eventIds: [e._id],
        description:
          `Event from blacklisted ${matchField}: ${e[matchField]} ` +
          `(Feodo Tracker: ${intel.malware} C2${intel.country ? `, ${intel.country}` : ''})`,
      });
    }
  }
  return matches;
};

const evalPortScanCount = (rule) =>
  evalCountBySourceIp(rule, {
    filter: { eventType: 'port_scan' },
    describe: (n, ip, w) => `${n} port scan events from ${ip} in ${w} seconds`,
  });

// A firewall refusing the same host over and over is one of the strongest
// signals of an active attack: the attempts were stopped, but someone is
// clearly still trying.
const evalFirewallBlockCount = (rule) =>
  evalCountBySourceIp(rule, {
    filter: { eventType: 'firewall_block' },
    describe: (n, ip, w) =>
      `${n} connections from ${ip} blocked by the firewall in ${w} seconds`,
  });

const evalMalwareSignatureAny = async (rule, newEvents) => {
  const matches = [];
  for (const e of newEvents) {
    if (e.eventType === 'malware_signature') {
      matches.push({
        eventIds: [e._id],
        description: `Malware signature detected: ${e.rawData?.signature || 'unknown'}`,
      });
    }
  }
  return matches;
};

const EVALUATORS = {
  failed_login_count: evalFailedLoginCount,
  blacklisted_ip: evalBlacklistedIp,
  port_scan_count: evalPortScanCount,
  firewall_block_count: evalFirewallBlockCount,
  malware_signature_any: evalMalwareSignatureAny,
};

const evaluateRule = async (rule, newEvents) => {
  const fn = EVALUATORS[rule.condition.type];
  if (!fn) {
    console.warn(`[analyzer] unknown rule type: ${rule.condition.type}`);
    return [];
  }
  return fn(rule, newEvents);
};

// --- Main entry point ------------------------------------------------------

// Cache active rules in memory for a few seconds to avoid hammering
// MongoDB on every batch. The cache is invalidated by any change to
// the Rule collection (via a TTL).
let rulesCache = null;
let rulesCachedAt = 0;
const RULES_TTL_MS = 5000;

const getActiveRules = async () => {
  const now = Date.now();
  if (rulesCache && now - rulesCachedAt < RULES_TTL_MS) return rulesCache;

  rulesCache = await Rule.find({ isActive: true });
  rulesCachedAt = now;
  return rulesCache;
};

// Call this from any route/controller that modifies rules to force a refresh.
const invalidateRulesCache = () => {
  rulesCache = null;
  rulesCachedAt = 0;
};

const runAnalysis = async (newEvents, io) => {
  if (!newEvents || newEvents.length === 0) return [];

  const rules = await getActiveRules();
  const allNewThreats = [];

  for (const rule of rules) {
    const matches = await evaluateRule(rule, newEvents);
    for (const match of matches) {
      const threat = await Threat.create({
        eventIds: match.eventIds,
        ruleTriggered: rule.name,
        severity: rule.severity,
        description: match.description,
        status: 'new',
      });
      allNewThreats.push(threat);

      // Mark the contributing events as 'flagged' so the UI can show
      // them differently and we can count flagged events cheaply.
      await Event.updateMany(
        { _id: { $in: match.eventIds } },
        { $set: { status: 'flagged' } }
      );

      // Live-broadcast the new threat so the dashboard and Threats
      // page can update without polling.
      if (io) io.emit('threat:new', threat);

      console.log(`[analyzer] THREAT [${rule.severity}] ${rule.name}: ${match.description}`);
    }
  }

  return allNewThreats;
};

module.exports = { runAnalysis, invalidateRulesCache, getActiveRules };
