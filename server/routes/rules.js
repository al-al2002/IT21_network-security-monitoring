// routes/rules.js
// Read endpoints: any authed user (so analysts can see what's running).
// Write endpoints: admin only — mutating detection rules is a privileged action.

const express = require('express');
const {
  listRules,
  createRule,
  updateRule,
  deleteRule,
} = require('../controllers/ruleController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, listRules);
router.post('/', requireAuth, requireRole('admin'), createRule);
router.patch('/:id', requireAuth, requireRole('admin'), updateRule);
router.delete('/:id', requireAuth, requireRole('admin'), deleteRule);

module.exports = router;
