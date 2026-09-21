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
  billId: { type: String, required: true },
  billStorageKey: { type: String, required: true },
  isReimbursable: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['Submitted', 'In Review', 'Approved', 'Rejected', 'Info Requested', 'Reimbursed', 'Paid'],
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
