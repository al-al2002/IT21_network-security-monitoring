// models/User.js
// A registered user of the NetGuard dashboard. Two roles:
//   - "admin"   : can manage rules, assign incidents, manage users
//   - "analyst" : can view and update incidents, view events/threats
//
// The password is stored ONLY as a bcrypt hash. The matching logic lives
// in controllers/authController.js (Phase 1 auth step).

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,        // creates a unique index automatically
      lowercase: true,     // "Foo@Bar.com" and "foo@bar.com" are the same
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    passwordHash: {
      type: String,
      required: true,
      // Never returned to the client. `select: false` keeps it out of
      // .find() / .findById() results by default.
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'analyst'],
      default: 'analyst',
      required: true,
    },
  },
  {
    // `timestamps: true` adds `createdAt` and `updatedAt` automatically.
    timestamps: true,
  }
);

// Why an explicit index on email when `unique: true` already creates one?
// Because `unique: true` builds the index, but if you ever want a non-unique
// index, or compound indexes, you need to declare them. Email lookup is our
// hot path (every login), so we want the index to be obviously there.
userSchema.index({ email: 1 });

// Instance method: compare a plaintext password (from the login form) to
// the stored hash. Returns a promise<boolean>.
// Note: this method needs `passwordHash` to be selected — we'll use
// .select('+passwordHash') in the auth controller when calling this.
userSchema.methods.comparePassword = function (plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);
};

// Static helper used by the auth controller to hash a password before
// saving it. Bcrypt's salt rounds (10) is the standard balance between
// security and speed. Each call uses a fresh random salt.
userSchema.statics.hashPassword = function (plaintext) {
  return bcrypt.hash(plaintext, 10);
};

// Strip sensitive fields whenever a user document is serialized to JSON
// (e.g. res.json(user)). Defense-in-depth — even if a route forgets to
// hide the hash, Mongoose strips it.
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
