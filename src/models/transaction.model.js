import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, default: 'Uncategorized' },
  paidVia: { type: String, default: 'UPI' },
  isReimbursable: { type: Boolean, default: false },
  note: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  source: { type: String, enum: ['manual', 'ocr', 'statement'], default: 'manual' },
  importBatchId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
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

export const TransactionModel =
  mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
