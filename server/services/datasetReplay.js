// services/datasetReplay.js
// DEFAULT event source. Replays real network flows from the CIC-IDS2017
// dataset (Canadian Institute for Cybersecurity, University of New Brunswick):
// traffic captured on a testbed network over five days in July 2017 while
// real attacks were run against it, with every flow labelled BENIGN or with
// its attack name.
//
//   https://www.unb.ca/cic/datasets/ids-2017.html
//
// The full dataset is ~2.8 million flows, so we replay a sample built by
// scripts/buildReplaySample.js into data/cicids2017-sample.csv. Every row in
// it is an unmodified flow from the original CSVs. What the replay changes:
//   - timestamp: set to "now" so the rolling-window rules and the live
//     dashboard work. The original capture time is kept in rawData.capturedAt.
//   - event shape: each flow is mapped onto NetGuard's event types (below).
//
// Lifecycle:
//   initReplay(io) is called once from server.js on startup. Every
//   REPLAY_INTERVAL_MS it takes the next REPLAY_BATCH_SIZE flows, maps them to
//   events and hands them to ingestEvents (save, broadcast, analyze). At the
//   end of the sample it loops back to the start.

const fs = require('fs');
const path = require('path');
const { ingestEvents } = require('./eventIngest');

const SAMPLE_FILE = path.join(__dirname, '..', 'data', 'cicids2017-sample.csv');
const REPLAY_INTERVAL_MS = parseInt(process.env.REPLAY_INTERVAL_MS) || 5000;
const BATCH_SIZE = parseInt(process.env.REPLAY_BATCH_SIZE) || 3;

// IANA protocol numbers used in the dataset's Protocol column.
const PROTOCOLS = { 6: 'TCP', 17: 'UDP', 1: 'ICMP' };

// CIC-IDS2017 label -> how NetGuard sees that flow.
//
// SSH-Patator / FTP-Patator are dictionary brute-force attacks run with the
// Patator tool. A flow record carries no authentication result, so each
// labelled attempt is recorded as a failed login — which is what the
// "Failed Login Attempts" rule counts.
//
// Bot is traffic from machines infected with the Ares botnet talking to their
// command-and-control server, so it is recorded as a malware detection.
const mapLabel = (label) => {
  switch (label) {
    case 'SSH-Patator':
      return { eventType: 'login_attempt', rawData: { service: 'SSH', success: false } };
    case 'FTP-Patator':
      return { eventType: 'login_attempt', rawData: { service: 'FTP', success: false } };
    case 'PortScan':
      return { eventType: 'port_scan', rawData: {} };
    case 'Bot':
      return {
        eventType: 'malware_signature',
        rawData: { signature: 'Botnet.Ares C2 traffic (CIC-IDS2017 label: Bot)' },
      };
    default:
      return { eventType: 'traffic', rawData: {} };
  }
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toEvent = (row) => {
  const { eventType, rawData } = mapLabel(row.Label);
  const fwdBytes = num(row['Total Length of Fwd Packets']);
  const bwdBytes = num(row['Total Length of Bwd Packets']);

  return {
    timestamp: new Date(),
    sourceIP: row['Source IP'],
    destinationIP: row['Destination IP'],
    eventType,
    protocol: PROTOCOLS[row.Protocol] || 'OTHER',
    port: num(row['Destination Port']),
    rawData: {
      ...rawData,
      dataset: 'CIC-IDS2017',
      label: row.Label,
      flowId: row['Flow ID'],
      capturedAt: row.Timestamp,
      sourcePort: num(row['Source Port']),
      durationMicros: num(row['Flow Duration']),
      packets: num(row['Total Fwd Packets']) + num(row['Total Backward Packets']),
      bytes: fwdBytes + bwdBytes,
    },
    status: 'normal',
  };
};

// The sample is plain CSV with no quoted fields (IPs, numbers and labels
// only), so a split on commas is enough.
const loadSample = () => {
  const lines = fs.readFileSync(SAMPLE_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
};

let timer = null;

// Returns true if the replay started, false if the sample is unavailable
// (the caller then falls back to the simulator).
const initReplay = (io) => {
  if (timer) return true; // guard against double-init (nodemon can cause this)

  let rows;
  try {
    rows = loadSample();
  } catch (err) {
    console.error(`[replay] cannot read ${SAMPLE_FILE}: ${err.message}`);
    return false;
  }
  if (rows.length === 0) {
    console.error(`[replay] ${SAMPLE_FILE} has no rows`);
    return false;
  }

  console.log(
    `[replay] replaying ${rows.length} CIC-IDS2017 flows ` +
      `(every ${REPLAY_INTERVAL_MS}ms, batch ${BATCH_SIZE})`
  );

  let cursor = 0;
  timer = setInterval(async () => {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      batch.push(toEvent(rows[cursor]));
      cursor = (cursor + 1) % rows.length;
      if (cursor === 0) console.log('[replay] reached end of sample, looping');
    }
    try {
      const saved = await ingestEvents(batch, io);
      console.log(`[replay] emitted ${saved.length} event(s)`);
    } catch (err) {
      console.error('[replay] batch failed:', err.message);
    }
  }, REPLAY_INTERVAL_MS);

  return true;
};

const stopReplay = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[replay] stopped');
  }
};

module.exports = { initReplay, stopReplay };
