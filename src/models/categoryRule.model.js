import mongoose from 'mongoose';

const CategoryRuleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  merchantPattern: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
  },
  userCreated: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

CategoryRuleSchema.index({ userId: 1, merchantPattern: 1 }, { unique: true });

export const CategoryRuleModel = mongoose.model('CategoryRule', CategoryRuleSchema);
