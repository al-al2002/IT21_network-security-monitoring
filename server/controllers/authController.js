// controllers/authController.js
// Two endpoints:
//   register  : create a new user, hash the password, return a JWT
//   login     : find the user, verify the password, return a JWT
//
// The shape of the response on success:
//   { user: { id, name, email, role }, token: "<jwt>" }
//
// Why bundle user + token in one response? The frontend wants to display
// the user's name/role immediately after login. Sending both saves a
// second "/me" request.
//
// Every login attempt — success or failure — is also recorded as a real
// login_attempt Event, so brute-forcing NetGuard's own sign-in page shows up
// on the dashboard and trips the "Failed Login Attempts" rule.

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ingestEvents } = require('../services/eventIngest');

// Sign a JWT for a given user. The payload is intentionally minimal —
// just enough to identify the user. Don't put sensitive data here; the
// token is decodable by anyone who gets it.
const signToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // re-login once a week
  );
};

// "::ffff:127.0.0.1" is an IPv4 address carried over an IPv6 socket, and
// "::1" is IPv6 loopback. Normalise both so the same machine always shows up
// as the same source IP and the per-IP failed-login count adds up.
const normalizeIp = (ip) => {
  if (!ip) return ip;
  if (ip === '::1') return '127.0.0.1';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
};

// Record a login attempt as an Event. Fire-and-forget: a logging failure must
// never block or break the login itself, so errors are only logged.
const recordLoginAttempt = (req, email, success) => {
  const event = {
    timestamp: new Date(),
    // req.ip honours X-Forwarded-For from the Vite dev proxy (see
    // "trust proxy" in server.js), so this is the browser's address.
    sourceIP: normalizeIp(req.ip),
    destinationIP: normalizeIp(req.socket.localAddress),
    eventType: 'login_attempt',
    protocol: req.secure ? 'HTTPS' : 'HTTP',
    port: req.socket.localPort,
    rawData: {
      source: 'netguard-login',
      username: String(email).toLowerCase().slice(0, 100),
      success,
      userAgent: (req.get('user-agent') || '').slice(0, 200),
    },
  };
  ingestEvents([event], req.app.get('io')).catch((err) =>
    console.error('[auth] failed to record login event:', err.message)
  );
};

const register = async (req, res) => {
  try {
    // `role` is deliberately NOT read from the body — see assignedRole below.
    const { name, email, password } = req.body;

    // Validation — Mongoose's required/unique validators run on save,
    // but a quick pre-check gives a cleaner error message.
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Public registration always creates an analyst, never an admin. A caller
    // can send role: "admin" in the body — from the signup form, from curl,
    // from anywhere — and it is ignored rather than honoured, so this endpoint
    // cannot be used to grant yourself admin rights. Privilege escalation is
    // the risk being closed here; hardcoding the role is what closes it.
    //
    // The first admin comes from scripts/seedAdmin.js, or from an existing
    // admin, never from this route.
    const assignedRole = 'analyst';

    // Hash the password BEFORE we ever touch the database. We never
    // store plaintext passwords, even momentarily.
    const passwordHash = await User.hashPassword(password);

    const user = await User.create({ name, email, passwordHash, role: assignedRole });

    const token = signToken(user);
    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    // Duplicate-email error from MongoDB has code 11000.
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Look up the user. We need the passwordHash to compare, so we
    // override the schema's `select: false` here.
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      // Same error for "no such email" and "wrong password" — don't
      // leak which one was wrong to an attacker.
      recordLoginAttempt(req, email, false);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      recordLoginAttempt(req, email, false);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    recordLoginAttempt(req, email, true);
    const token = signToken(user);
    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

// Returns the currently logged-in user. Useful for the frontend to
// verify a stored token is still valid on page load.
const me = async (req, res) => {
  // requireAuth middleware has already populated req.user.
  res.json({
    user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role },
  });
};

module.exports = { register, login, me };
