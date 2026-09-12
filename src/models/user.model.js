import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true,
  },
  phone: { type: String, default: '' },
  name: { type: String, default: 'FinTrack User' },
  avatarUrl: {
    type: String,
    default: '',
  },
  salary: { type: Number, default: 0 },
  rent: { type: Number, default: 0 },
  bills: { type: Number, default: 0 },
  emi: { type: Number, default: 0 },
  isSetupComplete: { type: Boolean, default: false },
  lastLoginAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
