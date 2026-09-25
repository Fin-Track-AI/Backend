import mongoose from 'mongoose';

const BillSchema = new mongoose.Schema({
  billId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, default: 'image/jpeg' },
  sizeBytes: { type: Number, default: 0 },
  storageKey: { type: String, required: true },
  filePath: { type: String, required: true },
  merchantName: { type: String, default: 'Unspecified Merchant' },
  totalAmount: { type: Number, default: null },
  uploadedAt: { type: Date, default: Date.now },
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
});

export const BillModel =
  mongoose.models.Bill || mongoose.model('Bill', BillSchema);
