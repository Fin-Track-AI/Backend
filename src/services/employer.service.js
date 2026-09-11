/**
 * In-memory storage for employer linking.
 * Key: userId, Value: Employer Object
 */
const employerStore = new Map();

export const employerService = {
  /**
   * Link an employer to a user.
   * BR-02: User can link exactly one employer at a time.
   */
  linkEmployer: async (userId, employerData) => {
    if (employerStore.has(userId)) {
      const existing = employerStore.get(userId);
      const error = new Error(`User already has a linked employer (${existing.employerName}). Unlink current employer before linking a new one.`);
      error.statusCode = 400;
      error.code = 'EMPLOYER_ALREADY_LINKED';
      throw error;
    }

    const linkedEmployer = {
      employerId: employerData.employerId || `emp_${Date.now()}`,
      employerName: employerData.employerName,
      corporateEmail: employerData.corporateEmail || null,
      employeeId: employerData.employeeId || null,
      verificationStatus: employerData.verificationStatus || 'VERIFIED',
      linkedAt: new Date().toISOString(),
    };

    employerStore.set(userId, linkedEmployer);
    return linkedEmployer;
  },

  /**
   * Get currently linked employer for a user.
   */
  getLinkedEmployer: async (userId) => {
    return employerStore.get(userId) || null;
  },

  /**
   * Unlink employer for a user.
   */
  unlinkEmployer: async (userId) => {
    if (!employerStore.has(userId)) {
      const error = new Error('No linked employer found to unlink.');
      error.statusCode = 404;
      error.code = 'NO_LINKED_EMPLOYER';
      throw error;
    }
    employerStore.delete(userId);
    return true;
  },

  /**
   * Helper to clear store for testing
   */
  _clearStore: () => {
    employerStore.clear();
  },
};
