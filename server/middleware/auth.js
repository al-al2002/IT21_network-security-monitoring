// middleware/auth.js
// Two pieces of middleware:
//   - requireAuth  : rejects the request if no valid JWT
//   - requireRole  : rejects the request if the JWT's role doesn't match
//
// How a protected route uses them:
//
//   router.get('/me', requireAuth, (req, res) => {
//     res.json({ user: req.user });
//   });
//
//   router.post('/rules', requireAuth, requireRole('admin'), createRule);

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    // 1. Pull the token out of the Authorization header.
    //    The browser sends it as "Bearer <token>".
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];

    // 2. Verify the signature and decode the payload.
    //    If the token was tampered with, expired, or signed with a
    //    different JWT_SECRET, this throws.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Look up the user. We exclude the passwordHash by default in
    //    the User model, so this is a clean object.
    //    .select('-passwordHash') is redundant given the schema's
    //    `select: false`, but being explicit helps readers.
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    // 4. Attach the user to the request so downstream handlers can
    //    use it without re-fetching.
    req.user = user;
    next();
  } catch (err) {
    // jwt.verify throws on invalid/expired tokens. Return 401 either way.
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// `requireRole` is a FACTORY — it returns middleware pre-configured for
// a specific role. We use it like: requireRole('admin')
const requireRole = (role) => {
  return (req, res, next) => {
    // requireAuth must have run first; req.user is guaranteed.
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ message: `Requires ${role} role` });
    }
    next();
  };
};

module.exports = { requireAuth, requireRole };
