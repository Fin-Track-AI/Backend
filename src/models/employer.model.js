import mongoose from 'mongoose';

const EmployerSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    employerId: { type: String, required: true },
    employerName: { type: String, required: true },
    corporateEmail: { type: String, default: null },
    employeeId: { type: String, default: null },
    department: { type: String, default: 'Engineering' },
    monthlyAllowance: { type: Number, default: 25000 },
    reimbursementLimit: { type: Number, default: null },
    role: { type: String, default: 'Associate' },
    inviteCode: { type: String, default: null },
    verificationStatus: {
      type: String,
      enum: ['VERIFIED', 'PENDING', 'REJECTED'],
      default: 'VERIFIED',
    },
    linkedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'employer_links',
  }
);

if (mongoose.models.Employer) {
  delete mongoose.models.Employer;
}

export const EmployerModel =
  mongoose.models.EmployerLink || mongoose.model('EmployerLink', EmployerSchema);
