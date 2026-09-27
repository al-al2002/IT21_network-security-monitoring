// scripts/testAuthHttp.js
// HTTP-level auth smoke test against a running server. Run with:
//   node scripts/testAuthHttp.js
//
// Prerequisites:
//   1. .env has a valid MONGO_URI
//   2. The server is running:  npm run dev
//
// What it does:
//   1. POST /api/auth/register   -> 201 + token
//   2. POST /api/auth/login      -> 200 + token
//   3. GET  /api/auth/me         -> 200 (with token)
//   4. GET  /api/auth/me         -> 401 (without token)
//
// Uses only Node's built-in `http` module so we don't need to install
// anything extra (no axios, no supertest). Keeps the dependency surface small.

const http = require('http');

const HOST = 'localhost';
const PORT = process.env.PORT || 5000;

const request = (method, path, body = null, token = null) =>
  new Promise((resolve, reject) => {
    const opts = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers.Authorization = `Bearer ${token}`;

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

const assert = (cond, label) => {
  if (!cond) {
    console.error(`[http] FAIL: ${label}`);
    process.exit(1);
  }
  console.log(`[http] pass: ${label}`);
};

(async () => {
  // Use a unique email per run so the test is repeatable
  const email = `tester_${Date.now()}@netguard.local`;
  const password = 'testpass123';

  console.log('[http] testing register...');
  const reg = await request('POST', '/api/auth/register', { name: 'Tester', email, password });
  assert(reg.status === 201, `register returns 201 (got ${reg.status})`);
  assert(typeof reg.body.token === 'string', 'register returns a token');
  const token = reg.body.token;

  console.log('[http] testing login...');
  const login = await request('POST', '/api/auth/login', { email, password });
  assert(login.status === 200, `login returns 200 (got ${login.status})`);
  assert(typeof login.body.token === 'string', 'login returns a token');

  console.log('[http] testing /me with token...');
  const me = await request('GET', '/api/auth/me', null, token);
  assert(me.status === 200, `/me with token returns 200 (got ${me.status})`);
  assert(me.body.user.email === email, '/me returns the right user');

  console.log('[http] testing /me without token...');
  const noAuth = await request('GET', '/api/auth/me');
  assert(noAuth.status === 401, `/me without token returns 401 (got ${noAuth.status})`);

  console.log('[http] testing /me with bad token...');
  const badAuth = await request('GET', '/api/auth/me', null, 'not-a-real-token');
  assert(badAuth.status === 401, `/me with bad token returns 401 (got ${badAuth.status})`);

  console.log('\n[http] ALL CHECKS PASSED');
})();
