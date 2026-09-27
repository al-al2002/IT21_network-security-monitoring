// scripts/seedAdmin.js
// Creates the first admin user. Public registration always downgrades
// to "analyst", so to get an admin you either run this script OR have
// an existing admin promote a user (Phase 6 will add that UI).
//
// Run with:  node scripts/seedAdmin.js
//
// Customize the credentials below, or read them from env vars.

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'NetGuard Admin';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@netguard.ph';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin123';

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[seed] connected to MongoDB');

    // Idempotent — if the admin already exists, we just confirm.
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        await existing.save();
        console.log('[seed] existing user promoted to admin');
      } else {
        console.log('[seed] admin already exists, no change');
      }
    } else {
      const passwordHash = await User.hashPassword(ADMIN_PASSWORD);
      await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'admin',
      });
      console.log(`[seed] created admin ${ADMIN_EMAIL}`);
      console.log(`[seed] password: ${ADMIN_PASSWORD}  (change this after first login)`);
    }
  } catch (err) {
    console.error('[seed] failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
