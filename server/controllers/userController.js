// controllers/userController.js
// Simple read-only list of users. Used by the incident-detail page
// to populate the "Assign to" dropdown. We never expose passwordHash
// (the User model already strips it from toJSON).

const User = require('../models/User');

const listUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('name email role').sort({ name: 1 });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users', error: err.message });
  }
};

module.exports = { listUsers };
