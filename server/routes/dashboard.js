// routes/dashboard.js
const express = require('express');
const { getTimeseries, getTopSources } = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/timeseries', requireAuth, getTimeseries);
router.get('/top-sources', requireAuth, getTopSources);

module.exports = router;
