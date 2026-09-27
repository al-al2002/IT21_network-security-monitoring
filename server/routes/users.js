// routes/users.js
// Read-only user list. Used by the incident assignment dropdown.
const express = require('express');
const { listUsers } = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, listUsers);

module.exports = router;
