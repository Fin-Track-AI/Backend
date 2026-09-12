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
});

export const BillModel =
  mongoose.models.Bill || mongoose.model('Bill', BillSchema);
