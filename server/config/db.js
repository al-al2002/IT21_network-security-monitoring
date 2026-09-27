// config/db.js
// Centralized MongoDB connection. Keeping it in /config means any file can
// `require('./config/db')` and trigger the connect — but we only call it
// once from server.js on startup.
const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error('\n[db] MONGO_URI is not set. Copy server/.env.example to server/.env.\n');
    process.exit(1);
  }

  try {
    // Mongoose 7+ no longer needs the old options like useNewUrlParser.
    // serverSelectionTimeoutMS: fail in 10s instead of the 30s default, so a
    // blocked IP shows up as an error quickly rather than looking like a hang.
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`[db] MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`\n[db] connection error: ${err.message}`);

    // Atlas locks access to an IP allow list. Home/campus IPs change, so a
    // project that worked yesterday can fail today with nothing else changed —
    // and the only visible symptom is the client's proxy ECONNREFUSED, because
    // the API exits here and never binds port 5000. Say so explicitly.
    if (/atlas|whitelist|ETIMEDOUT|ENOTFOUND|ServerSelection/i.test(err.message)) {
      console.error(
        '[db] This is usually the MongoDB Atlas IP access list. Your IP changes\n' +
          '[db] when you reconnect to the internet or switch networks.\n' +
          '[db] Fix: cloud.mongodb.com -> your project -> Network Access ->\n' +
          '[db]      "Add IP Address" -> "Add Current IP Address" -> Confirm.\n' +
          '[db] Then wait for the entry to go Active and start the app again.\n'
      );
    }

    // Exit the process on DB failure — without a database, the app is useless.
    process.exit(1);
  }
};

module.exports = connectDB;
