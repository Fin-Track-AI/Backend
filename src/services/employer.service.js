import { EmployerModel } from '../models/employer.model.js';

export const employerService = {
  /**
   * Link an employer to a user.
   * BR-02: User can link exactly one employer at a time.
   */
  linkEmployer: async (userId, employerData) => {
    const existing = await EmployerModel.findOne({ userId });
    if (existing) {
      const error = new Error(
        `User already has a linked employer (${existing.employerName}). Unlink current employer before linking a new one.`
      );
      error.statusCode = 400;
      error.code = 'EMPLOYER_ALREADY_LINKED';
      throw error;
    }

    const linkedEmployer = await EmployerModel.create({
      userId,
      employerId: employerData.employerId || `emp_${Date.now()}`,
      employerName: employerData.employerName,
      corporateEmail: employerData.corporateEmail || null,
      employeeId: employerData.employeeId || null,
      verificationStatus: employerData.verificationStatus || 'VERIFIED',
      linkedAt: new Date(),
    });

    return linkedEmployer.toObject();
  },

  /**
   * Get currently linked employer for a user.
   */
  getLinkedEmployer: async (userId) => {
    const employer = await EmployerModel.findOne({ userId }).lean();
    return employer || null;
  },

  /**
   * Unlink employer for a user.
   */
  unlinkEmployer: async (userId) => {
    const result = await EmployerModel.findOneAndDelete({ userId });
    if (!result) {
      const error = new Error('No linked employer found to unlink.');
      error.statusCode = 404;
      error.code = 'NO_LINKED_EMPLOYER';
      throw error;
    }
    return true;
  },

  /**
   * Helper to clear store for testing — deletes test user docs.
   */
  _clearStore: async () => {
    await EmployerModel.deleteMany({ userId: 'user_123' });
  },
};

