// scripts/buildReplaySample.js
// Builds data/cicids2017-sample.csv — the flows the dataset replay
// (services/datasetReplay.js) streams into NetGuard — from the original
// CIC-IDS2017 CSVs.
//
// Get the dataset:
//   https://www.unb.ca/cic/datasets/ids-2017.html -> CSVs/GeneratedLabelledFlows.zip
//   Unzip it; the CSVs are in a folder called "TrafficLabelling ".
//   (Use GeneratedLabelledFlows, not MachineLearningCSV: only the former has
//   the Source IP, Destination IP and Timestamp columns.)
//
// Run with:  node scripts/buildReplaySample.js "<path to TrafficLabelling folder>"
//
// What it does:
//   1. Reads the Tuesday (FTP/SSH-Patator), Friday morning (Bot) and Friday
//      afternoon (PortScan) captures, plus the BENIGN flows in them.
//   2. Keeps each flow unmodified except for dropping columns the replay does
//      not use (the ~70 statistical features).
//   3. Arranges them into alternating runs of attack and benign flows, taking
//      each run from a different point in the original capture. Within a run
//      the flows are consecutive, in their original order. This way a replay
//      shows a detection every couple of minutes instead of hours of benign
//      traffic followed by one long attack.
//
// The output is deterministic: the same input always produces the same file.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const OUTPUT = path.join(__dirname, '..', 'data', 'cicids2017-sample.csv');

const INPUT_FILES = [
  'Tuesday-WorkingHours.pcap_ISCX.csv',
  'Friday-WorkingHours-Morning.pcap_ISCX.csv',
  'Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv',
];

const KEEP_COLUMNS = [
  'Flow ID',
  'Source IP',
  'Source Port',
  'Destination IP',
  'Destination Port',
  'Protocol',
  'Timestamp',
  'Flow Duration',
  'Total Fwd Packets',
  'Total Backward Packets',
  'Total Length of Fwd Packets',
  'Total Length of Bwd Packets',
  'Label',
];

// Which flows of each attack to keep. Each filter selects the attacker ->
// target direction, which is how a sensor would report the attack:
//   - Patator: 172.16.0.1 -> 192.168.10.50 on the attacked service's port
//   - Bot: infected host -> the Ares C2 server on 8080 (drops the handful of
//     reverse-direction C2 -> host flows)
const ATTACKS = {
  'SSH-Patator': (r) => r['Destination Port'] === '22',
  'FTP-Patator': (r) => r['Destination Port'] === '21',
  PortScan: () => true,
  Bot: (r) => r['Destination Port'] === '8080',
};

// One cycle of the replay. At the default 3 flows every 5 seconds a cycle
// lasts about 6 minutes; failed-login and port-scan runs are long enough to
// cross their rule thresholds (5 and 3 events within 60 seconds).
const LEAD_IN_BENIGN = 12;
const CYCLE = [
  ['SSH-Patator', 15],
  ['BENIGN', 45],
  ['PortScan', 12],
  ['BENIGN', 45],
  ['FTP-Patator', 15],
  ['BENIGN', 45],
  ['Bot', 2], // every Bot flow is its own critical threat, so keep this short
  ['BENIGN', 45],
];
const CYCLES = 20;

const readFlows = async (file, byLabel) => {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = line.split(',').map((c) => c.trim());
    if (!header) {
      header = cells;
      continue;
    }
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    const label = row.Label;
    if (label !== 'BENIGN' && !(ATTACKS[label] && ATTACKS[label](row))) continue;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(KEEP_COLUMNS.map((c) => row[c]).join(','));
  }
};

// Take `count` runs of `length` consecutive flows, spread evenly across the
// whole list so the sample covers the full capture, not just its start.
const takeRuns = (flows, count, length) => {
  const runs = [];
  const span = flows.length - length;
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * span) / Math.max(1, count - 1));
    runs.push(flows.slice(start, start + length));
  }
  return runs;
};

(async () => {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/buildReplaySample.js "<path to TrafficLabelling folder>"');
    process.exit(1);
  }

  const byLabel = new Map();
  for (const name of INPUT_FILES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      console.error(`[build-sample] missing ${file}`);
      process.exit(1);
    }
    console.log(`[build-sample] reading ${name}`);
    await readFlows(file, byLabel);
  }
  for (const [label, flows] of byLabel) console.log(`  ${label}: ${flows.length} flows`);

  // How many runs of each label the whole sample needs.
  const runsNeeded = new Map();
  for (const [label] of CYCLE) runsNeeded.set(label, (runsNeeded.get(label) || 0) + CYCLES);
  runsNeeded.set('BENIGN', runsNeeded.get('BENIGN') + 1); // the lead-in

  const pools = new Map();
  for (const [label, count] of runsNeeded) {
    const length = label === 'BENIGN'
      ? Math.max(LEAD_IN_BENIGN, ...CYCLE.filter(([l]) => l === label).map(([, n]) => n))
      : CYCLE.find(([l]) => l === label)[1];
    pools.set(label, takeRuns(byLabel.get(label) || [], count, length));
  }

  const out = [KEEP_COLUMNS.join(',')];
  const next = (label, n) => pools.get(label).shift().slice(0, n);
  out.push(...next('BENIGN', LEAD_IN_BENIGN));
  for (let c = 0; c < CYCLES; c++) {
    for (const [label, n] of CYCLE) out.push(...next(label, n));
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, out.join('\n') + '\n');
  console.log(`[build-sample] wrote ${out.length - 1} flows to ${OUTPUT}`);
})();
