import mongoose from 'mongoose';

const ConsentHistorySchema = new mongoose.Schema(
  {
    consentType: { type: String, required: true },
    status: { type: String, enum: ['GRANTED', 'REVOKED'], required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ConsentSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  consents: {
    upiConsent: { type: Boolean, default: false },
    billStorageConsent: { type: Boolean, default: false },
    aiUsageConsent: { type: Boolean, default: false },
  },
  history: { type: [ConsentHistorySchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

export const ConsentModel =
  mongoose.models.Consent || mongoose.model('Consent', ConsentSchema);
