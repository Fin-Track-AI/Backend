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
  createdAt: { type: Date, default: Date.now },
});

export const TransactionModel =
  mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
