import mongoose from 'mongoose';

const memberSubSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    isCurrentUser: { type: Boolean, default: false },
  },
  { _id: false }
);

const splitGroupSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    icon: { type: String, default: '👥' },
    createdBy: { type: String, required: true },
    members: {
      type: [memberSubSchema],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length >= 2;
        },
        message: 'A group must have at least 2 members to split expenses',
      },
    },
  },
  { timestamps: true }
);

export const SplitGroup = mongoose.model('SplitGroup', splitGroupSchema);
