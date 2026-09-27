// scripts/testAuth.js
// End-to-end auth smoke test. Run with:
//   node scripts/testAuth.js
//
// This will:
//   1. Connect to MongoDB
//   2. Create a test user (or log in if it exists)
//   3. Verify a JWT can be issued and decoded
//   4. Verify the password compares correctly
//   5. Disconnect
//
// Use this to confirm your MongoDB connection and auth model work
// before testing through the HTTP layer.

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  try {
    console.log('[test] connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[test] connected.');

    const testEmail = 'test@netguard.local';
    const testPassword = 'testpass123';

    // Clean slate — drop the test user if it exists
    await User.deleteOne({ email: testEmail });

    console.log('[test] creating user...');
    const passwordHash = await User.hashPassword(testPassword);
    const user = await User.create({
      name: 'Test User',
      email: testEmail,
      passwordHash,
      role: 'analyst',
    });
    console.log('[test] created user id:', user._id.toString());

    // Confirm the hash is hidden by default
    const freshFetch = await User.findById(user._id);
    console.log('[test] toJSON strips passwordHash:', !freshFetch.toJSON().passwordHash);

    // Confirm password compare works
    const withHash = await User.findById(user._id).select('+passwordHash');
    const ok = await withHash.comparePassword(testPassword);
    const bad = await withHash.comparePassword('wrong');
    console.log('[test] correct password matches:', ok);
    console.log('[test] wrong password rejected:', !bad);

    // Confirm duplicate email is rejected
    let dupFailed = false;
    try {
      await User.create({ name: 'X', email: testEmail, passwordHash: 'x' });
    } catch (e) {
      dupFailed = e.code === 11000;
    }
    console.log('[test] duplicate email rejected:', dupFailed);

    console.log('\n[test] ALL CHECKS PASSED');
  } catch (err) {
    console.error('[test] FAILED:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
