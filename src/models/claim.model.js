import mongoose from 'mongoose';

const ClaimSchema = new mongoose.Schema({
  claimId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  employerId: { type: String, required: true },
  employerName: { type: String, required: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  project: { type: String, required: true },
  costCenter: { type: String, required: true },
  billId: { type: String, default: 'bill_none' },
  billStorageKey: { type: String, default: 'receipt_stored' },
  isReimbursable: { type: Boolean, default: true },
  settlementMethod: { type: String, default: 'OFFLINE_PAYROLL_EXTERNAL' },
  isFundMovementPrevented: { type: Boolean, default: true },
  retentionUntil: {
    type: Date,
    default: () => new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000),
    index: true,
  },
  retentionCategory: {
    type: String,
    enum: ['STATUTORY_5_YEAR', 'STANDARD', 'TRANSIENT'],
    default: 'STATUTORY_5_YEAR',
  },
  isStatutoryRetention: { type: Boolean, default: true },
  retentionStatus: {
    type: String,
    enum: ['ACTIVE', 'ELIGIBLE_FOR_PURGE', 'PURGED'],
    default: 'ACTIVE',
    index: true,
  },
  isAnonymized: { type: Boolean, default: false },
  anonymizedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ['Submitted', 'Pending', 'In Review', 'Approved', 'Rejected', 'Info Requested', 'Reimbursed', 'Paid'],
    default: 'Submitted',
  },
  adminNotes: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  requestedInfoNote: { type: String, default: '' },
  reviewerId: { type: String, default: '' },
  history: [
    {
      status: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      note: { type: String, default: '' },
      updatedBy: { type: String, default: 'System' },
    },
  ],
  submittedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const ClaimModel =
  mongoose.models.Claim || mongoose.model('Claim', ClaimSchema);
