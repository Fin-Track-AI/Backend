import mongoose from 'mongoose';

const InviteCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true,
    trim: true,
  },
  companyId: {
    type: String,
    required: true,
    index: true,
  },
  companyName: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    default: 'Engineering',
  },
  monthlyAllowance: {
    type: Number,
    default: 25000,
  },
  role: {
    type: String,
    default: 'Associate',
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'CLAIMED', 'REVOKED', 'EXPIRED'],
    default: 'ACTIVE',
    index: true,
  },
  claimedBy: {
    userId: { type: String, default: null },
    name: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    claimedAt: { type: Date, default: null },
  },
  createdBy: {
    type: String,
    default: 'Admin',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  },
});

export const InviteCodeModel =
  mongoose.models.InviteCode || mongoose.model('InviteCode', InviteCodeSchema);
