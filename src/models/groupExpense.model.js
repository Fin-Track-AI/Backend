import mongoose from 'mongoose';

const allocationSubSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true },
    memberName: { type: String, required: true },
    amount: { type: Number, required: true },
    percentage: { type: Number, default: 0 },
    items: { type: [String], default: [] },
  },
  { _id: false }
);

const itemizedEntrySubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    assignedMemberIds: { type: [String], default: [] },
  },
  { _id: false }
);

const groupExpenseSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    totalAmount: { type: Number, required: true, min: 0.01 },
    paidByMemberId: { type: String, required: true },
    paidByMemberName: { type: String, required: true },
    splitType: {
      type: String,
      enum: ['equal', 'percentage', 'itemized'],
      required: true,
    },
    allocations: {
      type: [allocationSubSchema],
      required: true,
    },
    category: { type: String, default: 'Food & Dining' },
    notes: { type: String, default: '' },
    itemizedEntries: { type: [itemizedEntrySubSchema], default: [] },
  },
  { timestamps: true }
);

export const GroupExpense = mongoose.model('GroupExpense', groupExpenseSchema);
