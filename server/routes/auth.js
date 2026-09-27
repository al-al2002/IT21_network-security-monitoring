// routes/auth.js
// Maps URLs to controller functions. Keep this file thin — the heavy
// lifting lives in controllers/authController.js.

const express = require('express');
const { register, login, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Public — anyone can hit these
router.post('/register', register);
router.post('/login', login);

// Protected — requires a valid JWT. The frontend calls this on page
// load to confirm the stored token still works.
router.get('/me', requireAuth, me);

module.exports = router;
