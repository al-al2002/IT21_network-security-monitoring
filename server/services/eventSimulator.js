// services/eventSimulator.js
// FALLBACK event source. Generates random synthetic security events on a
// timer. The default source is the CIC-IDS2017 replay (datasetReplay.js),
// which uses real captured traffic; this simulator only runs when
// EVENT_SOURCE=simulator, or when the replay sample file is missing.
//
// Lifecycle:
//   initSimulator(io) is called once from server.js on startup.
//   Every SIMULATOR_INTERVAL_MS milliseconds, it builds a small batch of
//   random events and hands it to ingestEvents (save, broadcast, analyze).
//
// Note: its "suspicious" IPs are documentation-only addresses (RFC 5737),
// so the Blacklisted IP rule — now backed by the real Feodo Tracker feed —
// will not fire in simulator mode.

const { ingestEvents } = require('./eventIngest');

// --- Configuration ---------------------------------------------------------
const SIMULATOR_INTERVAL_MS = parseInt(process.env.SIMULATOR_INTERVAL_MS) || 5000;
const BATCH_SIZE = parseInt(process.env.SIMULATOR_BATCH_SIZE) || 3;

// A small pool of IPs we'll pretend are "attacking". Choosing from a
// fixed pool means the analyzer's "10 failed logins from the same IP"
// rule has a chance to actually fire during a demo.
const SOURCE_IPS = [
  '192.168.1.50', '192.168.1.51', '10.0.0.13', '10.0.0.27',
  '172.16.0.5',  '172.16.0.99',
];
const SUSPICIOUS_IPS = [
  '203.0.113.7',
  '198.51.100.42',
  '45.83.91.12',
];
const DEST_IPS = ['10.0.0.10', '10.0.0.20', '10.0.0.30', '192.168.1.100'];
const COMMON_PORTS = [22, 80, 443, 3306, 3389, 8080];

// Services the perimeter firewall refuses from outside the network. Each entry
// pairs the port with the firewall rule that denies it, so a blocked event
// reads like a real firewall log line rather than a random port number.
const BLOCKED_SERVICES = [
  { port: 3389, rule: 'Block-RDP-External' },
  { port: 22, rule: 'Block-SSH-External' },
  { port: 3306, rule: 'Block-MySQL-External' },
  { port: 23, rule: 'Block-Telnet-Legacy' },
  { port: 445, rule: 'Block-SMB-External' },
];

// Probability that a generated event is one of the "scary" types we
// want the analyzer to detect. Keeps the demo quiet most of the time
// but produces real threats regularly.
const SUSPICIOUS_PROBABILITY = 0.25;

// --- Random helpers --------------------------------------------------------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Build a single realistic event. Returns a plain object ready for
// Event.create(). We do this synchronously (no I/O) so we can batch them.
const buildEvent = () => {
  const roll = Math.random();
  const sourceIP = roll < SUSPICIOUS_PROBABILITY ? pick(SUSPICIOUS_IPS) : pick(SOURCE_IPS);
  const destinationIP = pick(DEST_IPS);

  // 5 event types, picked with weighted probability. Malware signatures
  // are the rarest (we don't want to spam them). Firewall blocks are common
  // in real networks — a perimeter firewall refuses traffic constantly.
  const typeRoll = Math.random();
  let eventType, protocol, port, rawData;

  if (typeRoll < 0.4) {
    // login_attempt (40%)
    eventType = 'login_attempt';
    protocol = 'HTTPS';
    port = 443;
    const success = Math.random() > 0.6;  // 40% fail rate
    rawData = {
      username: pick(['root', 'admin', 'jdoe', 'service_acct']),
      success,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    };
  } else if (typeRoll < 0.65) {
    // port_scan (25%)
    eventType = 'port_scan';
    protocol = pick(['TCP', 'UDP']);
    port = pick(COMMON_PORTS);
    rawData = {
      portsProbed: randInt(3, 20),
      duration: randInt(1, 30),  // seconds
    };
  } else if (typeRoll < 0.85) {
    // firewall_block (20%) — a connection the firewall refused
    const service = pick(BLOCKED_SERVICES);
    eventType = 'firewall_block';
    protocol = 'TCP';
    port = service.port;
    rawData = {
      action: 'DENY',
      firewallRule: service.rule,
      direction: 'inbound',
    };
  } else if (typeRoll < 0.96) {
    // traffic (11%)
    eventType = 'traffic';
    protocol = pick(['TCP', 'UDP', 'ICMP']);
    port = pick(COMMON_PORTS);
    rawData = {
      bytes: randInt(500, 500000),
      packets: randInt(5, 5000),
    };
  } else {
    // malware_signature (4%)
    eventType = 'malware_signature';
    protocol = 'TCP';
    port = 443;
    rawData = {
      signature: pick(['Trojan.Generic.1234', 'Backdoor.Win32.Agent']),
      fileHash: Array.from({ length: 32 }, () => '0123456789abcdef'[randInt(0, 15)]).join(''),
    };
  }

  return {
    timestamp: new Date(),
    sourceIP,
    destinationIP,
    eventType,
    protocol,
    port,
    rawData,
    status: 'normal',  // the analyzer will set this to 'flagged' if a rule fires
  };
};

// --- Main loop -------------------------------------------------------------
let timer = null;

const initSimulator = (io) => {
  if (timer) return; // guard against double-init (nodemon can cause this)

  console.log(`[simulator] starting (every ${SIMULATOR_INTERVAL_MS}ms, batch ${BATCH_SIZE})`);

  timer = setInterval(async () => {
    try {
      const events = Array.from({ length: BATCH_SIZE }, buildEvent);
      const saved = await ingestEvents(events, io);
      console.log(`[simulator] emitted ${saved.length} event(s)`);
    } catch (err) {
      console.error('[simulator] batch failed:', err.message);
    }
  }, SIMULATOR_INTERVAL_MS);
};

const stopSimulator = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[simulator] stopped');
  }
};

module.exports = { initSimulator, stopSimulator };
