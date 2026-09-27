// scripts/cleanupSimulatedData.js
// Deletes the synthetic data the old event simulator left in the database,
// so the dashboard and Threats page show only real data.
//
// Run with:  node scripts/cleanupSimulatedData.js          (dry run: counts only)
//            node scripts/cleanupSimulatedData.js --yes    (actually delete)
//
// What counts as simulated:
//   - Events: every event without a real-source marker. Real events carry
//     rawData.dataset ("CIC-IDS2017", from the replay) or rawData.source
//     ("netguard-login", from real sign-ins); simulator events carry neither.
//   - Threats: detected before the first real event — i.e. before NetGuard
//     switched to real data, when the simulator was the only source.
//
// What is kept:
//   - All real events and every threat detected from them.
//   - All incidents, and any old threat an incident points to, so incident
//     history stays intact. (Those threats may show no linked events once
//     their simulated events are gone.)
//
// Deleting cannot be undone.

require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Threat = require('../models/Threat');
const Incident = require('../models/Incident');

const REAL_EVENT = {
  $or: [{ 'rawData.dataset': { $exists: true } }, { 'rawData.source': { $exists: true } }],
};
const SIMULATED_EVENT = { $nor: REAL_EVENT.$or };

(async () => {
  const confirmed = process.argv.includes('--yes');
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const firstReal = await Event.findOne(REAL_EVENT).sort({ timestamp: 1 }).select('timestamp');
    if (!firstReal) {
      console.log('[cleanup] no real events yet — nothing is safe to classify as simulated. Stopping.');
      return;
    }
    const cutoff = firstReal.timestamp;
    const keepThreatIds = await Incident.distinct('threatId');
    const simulatedThreats = { detectedAt: { $lt: cutoff }, _id: { $nin: keepThreatIds } };

    const [events, threats, keptThreats, totalEvents, totalThreats] = await Promise.all([
      Event.countDocuments(SIMULATED_EVENT),
      Threat.countDocuments(simulatedThreats),
      Threat.countDocuments({ detectedAt: { $lt: cutoff }, _id: { $in: keepThreatIds } }),
      Event.countDocuments(),
      Threat.countDocuments(),
    ]);

    console.log(`[cleanup] real data starts at ${cutoff.toISOString()}`);
    console.log(`  simulated events to delete:  ${events} of ${totalEvents}`);
    console.log(`  simulated threats to delete: ${threats} of ${totalThreats}`);
    console.log(`  old threats kept (have an incident): ${keptThreats}`);

    if (!confirmed) {
      console.log('\n[cleanup] dry run — nothing deleted. Re-run with --yes to delete.');
      return;
    }

    const [delEvents, delThreats] = await Promise.all([
      Event.deleteMany(SIMULATED_EVENT),
      Threat.deleteMany(simulatedThreats),
    ]);
    console.log(
      `\n[cleanup] deleted ${delEvents.deletedCount} events and ${delThreats.deletedCount} threats`
    );
  } catch (err) {
    console.error('[cleanup] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
