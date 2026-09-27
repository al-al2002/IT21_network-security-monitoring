// services/eventIngest.js
// The single path every event takes into NetGuard, whatever produced it:
// the CIC-IDS2017 replay, the simulator, or a real login to this server.
//
//   1. Insert the events into MongoDB (one round-trip for the batch)
//   2. Broadcast 'event:new' so the Events page updates live
//   3. Run the analysis engine, which may create Threats
//
// Keeping this in one place means a new event source only has to build
// event objects — detection works for it automatically.

const Event = require('../models/Event');
const { runAnalysis } = require('./analyzer');

const ingestEvents = async (events, io) => {
  if (!events || events.length === 0) return [];

  const saved = await Event.insertMany(events);

  if (io) {
    for (const evt of saved) io.emit('event:new', evt);
  }

  await runAnalysis(saved, io);
  return saved;
};

module.exports = { ingestEvents };
