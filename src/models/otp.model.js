import mongoose from 'mongoose';

const OtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300, // MongoDB automatically deletes documents after 5 minutes (300 seconds)
  },
});

export const OtpModel = mongoose.models.Otp || mongoose.model('Otp', OtpSchema);
