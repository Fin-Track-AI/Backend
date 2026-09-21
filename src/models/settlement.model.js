import mongoose from 'mongoose';

const settlementSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true, index: true },
    debtKey: { type: String, required: true, unique: true, index: true },
    fromMemberId: { type: String, required: true },
    fromMemberName: { type: String, required: true },
    toMemberId: { type: String, required: true },
    toMemberName: { type: String, required: true },
    amount: { type: Number, required: true },
    isSettled: { type: Boolean, default: true },
    settlementNote: {
      type: String,
      default: 'Settled via external UPI/Cash (Non-monetary FinTrack ledger)',
    },
    settledByUserId: { type: String, required: true },
    settledAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Settlement = mongoose.model('Settlement', settlementSchema);
