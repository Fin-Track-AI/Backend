import mongoose from 'mongoose';

const EmployerSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  employerId: { type: String, required: true },
  employerName: { type: String, required: true },
  corporateEmail: { type: String, default: null },
  employeeId: { type: String, default: null },
  verificationStatus: {
    type: String,
    enum: ['VERIFIED', 'PENDING', 'REJECTED'],
    default: 'VERIFIED',
  },
  linkedAt: { type: Date, default: Date.now },
});

export const EmployerModel =
  mongoose.models.Employer || mongoose.model('Employer', EmployerSchema);
