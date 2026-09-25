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
  fullName: { type: String, default: 'FinTrack User' },
  name: { type: String, default: 'FinTrack User' },
  password: {
    type: String,
    select: false,
    default: null,
  },
  phone: { type: String, default: '' },
  dob: { type: Date, default: () => new Date('2000-01-01') },
  kycStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'REJECTED'],
    default: 'PENDING',
  },
  consentStatus: {
    type: String,
    enum: ['NONE', 'PARTIAL', 'FULL'],
    default: 'NONE',
  },
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
  updatedAt: { type: Date, default: Date.now },
});

export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
