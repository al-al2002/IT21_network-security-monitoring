// routes/events.js
// All event routes require a valid JWT — even reads, so the dashboard
// can't be scraped by an unauthenticated user.

const express = require('express');
const { listEvents, getStats } = require('../controllers/eventController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, listEvents);
router.get('/stats', requireAuth, getStats);

module.exports = router;
