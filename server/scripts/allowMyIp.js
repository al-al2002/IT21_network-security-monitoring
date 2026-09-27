// scripts/allowMyIp.js
// Adds this computer's current public IP to the MongoDB Atlas IP access list.
//
// Why this exists: Atlas only accepts database connections from IPs on its
// access list, and a home or campus IP changes every time you reconnect to
// the internet. Without this, the API exits on startup with a connection
// error and the dashboard fails to load with "http proxy error: ECONNREFUSED".
//
// Run it directly:      npm run allow-ip     (from the netguard folder)
// Or let it run itself: npm run dev          (dev.js calls this first)
//
// Setup (one time) — add these to server/.env:
//   ATLAS_PUBLIC_KEY=...    Atlas -> Access Manager -> API Keys -> public key
//   ATLAS_PRIVATE_KEY=...   the private key shown when you create that key
//   ATLAS_PROJECT_ID=...    Atlas -> Project Settings -> Project ID
//
// The API key needs the "Project IP Access List Admin" role.
// If those three are not set, this script does nothing and exits quietly —
// it never blocks startup.

require('dotenv').config();
const crypto = require('crypto');

const ATLAS_API = 'https://cloud.mongodb.com/api/atlas/v2';
const ATLAS_ACCEPT = 'application/vnd.atlas.2023-01-01+json';
const COMMENT = 'NetGuard dev (auto-added)';

const PUBLIC_KEY = process.env.ATLAS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.ATLAS_PRIVATE_KEY;
const PROJECT_ID = process.env.ATLAS_PROJECT_ID;

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// --- HTTP Digest auth ------------------------------------------------------
// The Atlas Administration API authenticates with HTTP Digest, not a bearer
// token: the first request comes back 401 with a nonce, and we hash the key
// pair against that nonce to build the real Authorization header.

const parseAuthHeader = (header) => {
  const params = {};
  const body = header.replace(/^Digest\s+/i, '');
  const re = /(\w+)=(?:"([^"]*)"|([^,]*))/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    params[m[1]] = m[2] !== undefined ? m[2] : (m[3] || '').trim();
  }
  return params;
};

// `creds` and `cnonce` are injectable so the hashing can be checked against
// the RFC 2617 test vector; production calls use the env keys and a random
// client nonce.
const buildDigestHeader = (
  params,
  { method, uri, creds = { user: PUBLIC_KEY, pass: PRIVATE_KEY }, cnonce }
) => {
  const realm = params.realm || '';
  const nonce = params.nonce || '';
  // qop can be a list ("auth,auth-int"); we only implement "auth".
  const qop = params.qop ? params.qop.split(',')[0].trim() : null;
  cnonce = cnonce || crypto.randomBytes(8).toString('hex');
  const nc = '00000001';

  const { user: PUBLIC_KEY, pass: PRIVATE_KEY } = creds;
  const ha1 = md5(`${PUBLIC_KEY}:${realm}:${PRIVATE_KEY}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  let header =
    `Digest username="${PUBLIC_KEY}", realm="${realm}", nonce="${nonce}", ` +
    `uri="${uri}", response="${response}"`;
  if (qop) header += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (params.opaque) header += `, opaque="${params.opaque}"`;
  if (params.algorithm) header += `, algorithm=${params.algorithm}`;
  return header;
};

const digestFetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const parsed = new URL(url);
  const uri = parsed.pathname + parsed.search;

  const challenge = await fetch(url, options);
  if (challenge.status !== 401) return challenge;

  const wwwAuth = challenge.headers.get('www-authenticate');
  if (!wwwAuth) return challenge;

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: buildDigestHeader(parseAuthHeader(wwwAuth), { method, uri }),
    },
  });
};

// --- Steps -----------------------------------------------------------------

const getPublicIp = async () => {
  const res = await fetch('https://api.ipify.org?format=json');
  if (!res.ok) throw new Error(`could not detect public IP (HTTP ${res.status})`);
  const { ip } = await res.json();
  if (!ip) throw new Error('IP lookup returned no address');
  return ip;
};

// Atlas stores a single address as a /32 CIDR block, so an entry added as
// "1.2.3.4" comes back as cidrBlock "1.2.3.4/32". Check both shapes, and
// treat an existing 0.0.0.0/0 as already covering us.
const alreadyAllowed = (entries, ip) =>
  entries.some(
    (e) =>
      e.ipAddress === ip || e.cidrBlock === `${ip}/32` || e.cidrBlock === '0.0.0.0/0'
  );

const allowMyIp = async () => {
  if (!PUBLIC_KEY || !PRIVATE_KEY || !PROJECT_ID) {
    console.log(
      '[atlas-ip] skipped - ATLAS_PUBLIC_KEY / ATLAS_PRIVATE_KEY / ATLAS_PROJECT_ID not set in server/.env'
    );
    return { skipped: true };
  }

  const ip = await getPublicIp();

  const listUrl = `${ATLAS_API}/groups/${PROJECT_ID}/accessList?itemsPerPage=500`;
  const listRes = await digestFetch(listUrl, { headers: { Accept: ATLAS_ACCEPT } });

  if (listRes.status === 401) {
    throw new Error('Atlas rejected the API key. Check ATLAS_PUBLIC_KEY and ATLAS_PRIVATE_KEY.');
  }
  if (listRes.status === 404) {
    throw new Error(`Atlas project ${PROJECT_ID} not found. Check ATLAS_PROJECT_ID.`);
  }
  if (!listRes.ok) {
    throw new Error(`Atlas returned HTTP ${listRes.status} reading the access list`);
  }

  const { results = [] } = await listRes.json();
  if (alreadyAllowed(results, ip)) {
    console.log(`[atlas-ip] ${ip} is already allowed - nothing to do`);
    return { ip, added: false };
  }

  const addRes = await digestFetch(`${ATLAS_API}/groups/${PROJECT_ID}/accessList`, {
    method: 'POST',
    headers: { Accept: ATLAS_ACCEPT, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ ipAddress: ip, comment: COMMENT }]),
  });

  // 409 means another run added it a moment ago - same end state, not an error.
  if (addRes.status === 409) {
    console.log(`[atlas-ip] ${ip} was already added - nothing to do`);
    return { ip, added: false };
  }
  if (!addRes.ok) {
    const detail = await addRes.text().catch(() => '');
    throw new Error(`Atlas returned HTTP ${addRes.status} adding the IP. ${detail.slice(0, 200)}`);
  }

  console.log(`[atlas-ip] added ${ip} to the Atlas access list`);
  console.log('[atlas-ip] it can take up to a minute before Atlas accepts connections');
  return { ip, added: true };
};

module.exports = { allowMyIp, parseAuthHeader, buildDigestHeader };

// Run standalone: never exit non-zero, so a failure here cannot stop `npm run dev`.
// The database connection error is a clearer signal than an aborted startup.
if (require.main === module) {
  allowMyIp().catch((err) => {
    console.error(`[atlas-ip] could not update the access list: ${err.message}`);
    console.error('[atlas-ip] add your IP manually at cloud.mongodb.com -> Network Access');
  });
}
