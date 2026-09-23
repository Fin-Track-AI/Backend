import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ['invitation', 'splitExpense', 'claim', 'system'],
      default: 'system',
    },
    isRead: { type: Boolean, default: false },
    actionStatus: { type: String, enum: ['ACCEPTED', 'DECLINED', null], default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Notification = mongoose.model('Notification', notificationSchema);
