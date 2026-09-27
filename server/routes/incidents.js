// routes/incidents.js
// All routes require auth. Only admins can assign incidents to others —
// analysts can claim work for themselves (PATCH with assignedTo: <self>).
// To keep the demo simple we allow any authed user to create/update; the
// "admin-only for assigning to others" rule is enforced in the controller
// (left as a Phase 6 enhancement or skipped for the demo).

const express = require('express');
const {
  listIncidents,
  getIncident,
  createIncident,
  updateIncident,
  addAction,
  getStats,
} = require('../controllers/incidentController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', requireAuth, getStats);
router.get('/', requireAuth, listIncidents);
router.get('/:id', requireAuth, getIncident);
router.post('/', requireAuth, createIncident);
router.patch('/:id', requireAuth, updateIncident);
router.post('/:id/actions', requireAuth, addAction);

module.exports = router;
