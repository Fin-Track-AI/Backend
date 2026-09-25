import mongoose from 'mongoose';

const NudgeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['SPIKE', 'SUBSCRIPTION', 'SAVINGS'],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    default: 0,
  },
  category: {
    type: String,
    default: 'General',
  },
  actionText: {
    type: String,
    default: null,
  },
  read: {
    type: Boolean,
    default: false,
  },
  dismissed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const NudgeModel = mongoose.model('Nudge', NudgeSchema);
