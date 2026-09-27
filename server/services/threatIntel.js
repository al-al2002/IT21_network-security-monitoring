// services/threatIntel.js
// Real threat intelligence for the "blacklisted_ip" rule. Replaces the old
// hardcoded list of documentation-only addresses with the abuse.ch Feodo
// Tracker blocklist: botnet command-and-control servers (Emotet, QakBot,
// Dridex, ...) observed in the wild, published free with no API key.
//
//   https://feodotracker.abuse.ch/blocklist/
//
// Lifecycle:
//   initThreatIntel() is called once from server.js on startup. It loads the
//   last saved copy from disk immediately (so detection works even with no
//   internet — e.g. on a flaky campus network during a demo), then fetches a
//   fresh copy and refreshes it every THREAT_FEED_REFRESH_HOURS.
//
// The analyzer calls lookupIp(ip) for each event; a hit returns the feed's
// record for that IP so the threat description can name the malware family.

const fs = require('fs');
const path = require('path');

const FEED_URL =
  process.env.THREAT_FEED_URL || 'https://feodotracker.abuse.ch/downloads/ipblocklist.json';
const REFRESH_MS = (parseFloat(process.env.THREAT_FEED_REFRESH_HOURS) || 6) * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
// Deliberately not ".json": nodemon restarts the server when a watched .json
// file changes, and every restart refreshes the feed and rewrites this file.
const CACHE_FILE = path.join(__dirname, '..', 'data', 'feodo-blocklist.cache');

// ip -> { malware, port, status, country, asName, firstSeen, lastOnline }
let blocklist = new Map();
let fetchedAt = null;
let timer = null;

const indexFeed = (list) => {
  const map = new Map();
  for (const entry of list) {
    if (!entry.ip_address) continue;
    map.set(entry.ip_address, {
      malware: entry.malware || 'unknown',
      port: entry.port,
      status: entry.status,
      country: entry.country,
      asName: entry.as_name,
      firstSeen: entry.first_seen,
      lastOnline: entry.last_online,
    });
  }
  return map;
};

const loadCache = () => {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    blocklist = indexFeed(cached.list);
    fetchedAt = new Date(cached.fetchedAt);
    console.log(
      `[threat-intel] loaded ${blocklist.size} C2 IPs from cache (fetched ${fetchedAt.toISOString()})`
    );
  } catch {
    // No cache yet (first run) — the network fetch below fills it.
  }
};

const refresh = async () => {
  try {
    const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error('unexpected feed format');

    blocklist = indexFeed(list);
    fetchedAt = new Date();
    await fs.promises.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.promises.writeFile(CACHE_FILE, JSON.stringify({ fetchedAt, source: FEED_URL, list }));
    console.log(`[threat-intel] loaded ${blocklist.size} C2 IPs from Feodo Tracker`);
  } catch (err) {
    // Never fatal: keep whatever list we already have (cache or last fetch).
    console.warn(
      `[threat-intel] feed refresh failed (${err.message}); ` +
        (blocklist.size ? `keeping ${blocklist.size} cached IPs` : 'blacklist is empty')
    );
  }
};

const initThreatIntel = () => {
  if (timer) return; // guard against double-init
  loadCache();
  refresh(); // not awaited — startup should not wait on the network
  timer = setInterval(refresh, REFRESH_MS);
  timer.unref(); // don't keep the process alive just for this timer
};

const lookupIp = (ip) => blocklist.get(ip) || null;

const getThreatIntelStatus = () => ({
  source: 'abuse.ch Feodo Tracker',
  url: FEED_URL,
  ipCount: blocklist.size,
  fetchedAt,
});

module.exports = { initThreatIntel, lookupIp, getThreatIntelStatus };
