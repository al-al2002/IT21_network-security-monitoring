// routes/threats.js
// All routes require auth. Only admins can change a threat's status —
// in practice any analyst should be able to mark a threat as reviewed.

const express = require('express');
const {
  listThreats,
  getThreat,
  updateThreat,
  getThreatStats,
} = require('../controllers/threatController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', requireAuth, getThreatStats);
router.get('/', requireAuth, listThreats);
router.get('/:id', requireAuth, getThreat);
router.patch('/:id', requireAuth, updateThreat);

module.exports = router;
