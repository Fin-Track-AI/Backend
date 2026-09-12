import { ClaimModel } from '../models/claim.model.js';
import { employerService } from './employer.service.js';
import { billService } from './bill.service.js';

export const claimService = {
  /**
   * Submit a new reimbursement claim.
   * BR-12 & SCRUM-33: Validates linked employer, attached bill, and mandatory selections.
   */
  submitClaim: async (userId, claimData) => {
    // 1. Verify Linked Employer (SCRUM-33)
    const linkedEmployer = await employerService.getLinkedEmployer(userId);
    if (!linkedEmployer) {
      const error = new Error(
        'No linked employer found. Link an employer before submitting reimbursement claims.'
      );
      error.statusCode = 400;
      error.code = 'NO_LINKED_EMPLOYER';
      throw error;
    }

    // 2. Validate Required Fields
    const { title, amount, category, project, costCenter, billId } = claimData;

    if (!title || !title.trim()) {
      const error = new Error('Expense title is required');
      error.statusCode = 400;
      throw error;
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      const error = new Error('Valid expense amount is required');
      error.statusCode = 400;
      throw error;
    }

    if (!category || !category.trim()) {
      const error = new Error('Expense category selection is required before submission.');
      error.statusCode = 400;
      error.code = 'MISSING_CATEGORY';
      throw error;
    }

    if (!project || !project.trim()) {
      const error = new Error('Project selection is required before submission.');
      error.statusCode = 400;
      error.code = 'MISSING_PROJECT';
      throw error;
    }

    if (!costCenter || !costCenter.trim()) {
      const error = new Error('Cost center selection is required before submission.');
      error.statusCode = 400;
      error.code = 'MISSING_COST_CENTER';
      throw error;
    }

    if (!billId) {
      const error = new Error('Attached bill is required before submitting a claim.');
      error.statusCode = 400;
      error.code = 'MISSING_BILL_ATTACHMENT';
      throw error;
    }

    // 3. Verify attached bill ownership
    const billRecord = await billService.getBillById(billId, userId);

    const claimId = `claim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = new Date();

    const claimRecord = await ClaimModel.create({
      claimId,
      userId,
      employerId: linkedEmployer.employerId,
      employerName: linkedEmployer.employerName,
      title: title.trim(),
      amount: Number(amount),
      category: category.trim(),
      project: project.trim(),
      costCenter: costCenter.trim(),
      billId: billRecord.billId,
      billStorageKey: billRecord.storageKey,
      isReimbursable: true,
      status: 'Submitted',
      submittedAt: now,
      updatedAt: now,
    });

    return claimRecord.toObject();
  },

  /**
   * Get user's submitted claims list for "My Claims" view.
   */
  getUserClaims: async (userId) => {
    return await ClaimModel.find({ userId }).sort({ submittedAt: -1 }).lean();
  },

  /**
   * Get specific claim details for authenticated owner.
   */
  getClaimById: async (claimId, requestingUserId) => {
    const claim = await ClaimModel.findOne({ claimId }).lean();
    if (!claim) {
      const error = new Error(`Claim '${claimId}' not found.`);
      error.statusCode = 404;
      throw error;
    }

    if (claim.userId !== requestingUserId) {
      const error = new Error('Access denied: You do not own this claim.');
      error.statusCode = 403;
      error.code = 'TENANT_ISOLATION_VIOLATION';
      throw error;
    }

    return claim;
  },

  /**
   * Helper to clear store for testing.
   */
  _clearStore: async () => {
    await ClaimModel.deleteMany({ userId: 'user_123' });
  },
};

