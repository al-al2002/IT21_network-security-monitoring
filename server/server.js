// server.js
// Entry point. Order of operations matters here:
//   1. Load .env FIRST so process.env is available everywhere
//   2. Connect to MongoDB
//   3. Start HTTP server (which also hosts Socket.io)
//   4. Start the threat intel feed and the event source

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const { initSimulator } = require('./services/eventSimulator');
const { initReplay } = require('./services/datasetReplay');
const { initThreatIntel } = require('./services/threatIntel');

const app = express();
const server = http.createServer(app);

// Why a separate HTTP server? Socket.io needs to attach to a raw HTTP server,
// not just an Express app. We create the HTTP server explicitly, give it
// to Express, and then hand the same server to Socket.io.
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Which proxies may tell us the client's real IP via X-Forwarded-For. This is
// what makes req.ip — and so the source IP on login events — correct.
//   Local dev (default "loopback"): trust only the Vite dev proxy on this
//     machine, so a remote client cannot spoof its IP with the header.
//   Render: set TRUST_PROXY to the number of proxy hops in front of the app
//     (see render.yaml).
const TRUST_PROXY = process.env.TRUST_PROXY || 'loopback';
app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);

// Middleware stack
app.use(cors());                       // allow the React dev server to call us
app.use(express.json());               // parse JSON request bodies
app.use(express.urlencoded({ extended: true }));

// Make `io` accessible from any route via req.app.get('io')
// (Used by controllers that create events, e.g. login attempts.)
app.set('io', io);

// Health check route — useful for confirming the server is up
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'netguard', timestamp: new Date() });
});

// Socket.io connection handler
// Socket authentication. The client already puts its JWT in the handshake
// (see client/src/lib/socket.js), so verifying it here lets us drop each
// connection into a room named after the user. That is what makes a targeted
// notification possible — "tell THIS analyst they were assigned an incident"
// rather than broadcasting it to every open browser.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.id;
      socket.userRole = payload.role;
    } catch {
      // A missing or expired token is not fatal here: the connection still
      // receives the public broadcasts, it just gets no personal room. The
      // REST API rejects the token separately, which is where it matters.
    }
  }
  next();
});

io.on('connection', (socket) => {
  if (socket.userId) socket.join(`user:${socket.userId}`);
  console.log(
    `[socket] client connected: ${socket.id}${socket.userId ? ` (user ${socket.userId})` : ' (anonymous)'}`
  );
  socket.on('disconnect', () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });
});

// Auth routes (Phase 1)
app.use('/api/auth', require('./routes/auth'));

// Events routes (Phase 2)
app.use('/api/events', require('./routes/events'));

// Threats routes (Phase 3)
app.use('/api/threats', require('./routes/threats'));

// Rules routes (Phase 3, admin-only mutations)
app.use('/api/rules', require('./routes/rules'));

// Incidents routes (Phase 4)
app.use('/api/incidents', require('./routes/incidents'));

// Users (for the assignee picker on incidents - Phase 4)
app.use('/api/users', require('./routes/users'));

// Dashboard aggregations (Phase 5)
app.use('/api/dashboard', require('./routes/dashboard'));

// Production: serve the built React app from the same server, so the client's
// relative "/api" and "/socket.io" URLs reach this API with no proxy or CORS.
// In local dev this folder may not exist (Vite serves the client), and then
// this is skipped.
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST));
  // Any other non-API GET is a React Router page (/threats, /incidents/123...):
  // send index.html and let the client-side router render it.
  app.get(/^\/(?!api\/|socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// Start everything
const PORT = process.env.PORT || 5000;

// Where background events come from:
//   replay    (default) real CIC-IDS2017 flows, see services/datasetReplay.js
//   simulator synthetic random events, kept as a fallback
//   none      no background events; only real login attempts
// Real login attempts are always recorded, whatever this is set to.
const EVENT_SOURCE = (process.env.EVENT_SOURCE || 'replay').toLowerCase();

const startEventSource = () => {
  if (EVENT_SOURCE === 'none') {
    console.log('[server] EVENT_SOURCE=none: only real login attempts will be recorded');
    return;
  }
  if (EVENT_SOURCE === 'simulator') return initSimulator(io);
  if (!initReplay(io)) {
    console.warn('[server] replay unavailable, falling back to the simulator');
    initSimulator(io);
  }
};

const start = async () => {
  await connectDB();
  initThreatIntel();
  server.listen(PORT, () => {
    console.log(`[server] NetGuard API running on http://localhost:${PORT}`);
    // Start events only after the server is up, so the first events have
    // somewhere to go if they trigger a socket emit.
    startEventSource();
  });
};

start();
