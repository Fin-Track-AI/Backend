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
      history: [
        {
          status: 'Submitted',
          timestamp: now,
          note: 'Claim submitted by employee',
          updatedBy: userId,
        },
      ],
      submittedAt: now,
      updatedAt: now,
    });

    return claimRecord.toObject();
  },

  /**
   * Validate state transitions for BR-14 state machine rules.
   */
  validateStatusTransition: (currentStatus, newStatus) => {
    if (currentStatus === newStatus) {
      return true;
    }

    // Terminal state - cannot transition from Reimbursed / Paid
    if (currentStatus === 'Reimbursed' || currentStatus === 'Paid') {
      const error = new Error(
        `Invalid state transition: Claim '${currentStatus}' is in terminal state and cannot be modified.`
      );
      error.statusCode = 400;
      error.code = 'INVALID_STATE_TRANSITION';
      throw error;
    }

    // Rejected state - cannot transition directly to Reimbursed or Approved without resubmission
    if (currentStatus === 'Rejected' && (newStatus === 'Reimbursed' || newStatus === 'Paid' || newStatus === 'Approved')) {
      const error = new Error(
        `Invalid state transition: Cannot transition from '${currentStatus}' directly to '${newStatus}'.`
      );
      error.statusCode = 400;
      error.code = 'INVALID_STATE_TRANSITION';
      throw error;
    }

    // Direct transition to Reimbursed is only allowed from Approved
    if ((newStatus === 'Reimbursed' || newStatus === 'Paid') && currentStatus !== 'Approved') {
      const error = new Error(
        `Invalid state transition: Only 'Approved' claims can be marked as 'Reimbursed' (current: '${currentStatus}').`
      );
      error.statusCode = 400;
      error.code = 'INVALID_STATE_TRANSITION';
      throw error;
    }

    const validTransitions = {
      Submitted: ['In Review', 'Approved', 'Rejected', 'Info Requested'],
      'In Review': ['Approved', 'Rejected', 'Info Requested'],
      'Info Requested': ['Submitted', 'In Review', 'Approved', 'Rejected'],
      Approved: ['Reimbursed', 'Paid', 'Rejected'],
      Rejected: ['In Review', 'Submitted'],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      const error = new Error(
        `Invalid state transition: Cannot change claim status from '${currentStatus}' to '${newStatus}'.`
      );
      error.statusCode = 400;
      error.code = 'INVALID_STATE_TRANSITION';
      throw error;
    }

    return true;
  },

  /**
   * BR-13 & BR-14: Reviewer action to update claim status (Approve, Reject, Request Info, Reimburse).
   */
  updateClaimStatus: async (claimId, newStatus, note = '', reviewerId = 'Admin Reviewer') => {
    const claim = await ClaimModel.findOne({ claimId });
    if (!claim) {
      const error = new Error(`Claim '${claimId}' not found.`);
      error.statusCode = 404;
      throw error;
    }

    // Validate state transition guard
    claimService.validateStatusTransition(claim.status, newStatus);

    claim.status = newStatus;
    claim.updatedAt = new Date();
    claim.reviewerId = reviewerId;

    if (newStatus === 'Rejected') {
      claim.rejectionReason = note || 'Not compliant with policy.';
    } else if (newStatus === 'Info Requested') {
      claim.requestedInfoNote = note || 'Additional information or documents required.';
    } else if (note) {
      claim.adminNotes = note;
    }

    claim.history.push({
      status: newStatus,
      timestamp: new Date(),
      note: note || `Status updated to ${newStatus}`,
      updatedBy: reviewerId,
    });

    await claim.save();
    return claim.toObject();
  },

  /**
   * Get user's submitted claims list for "My Claims" view.
   */
  getUserClaims: async (userId) => {
    return await ClaimModel.find({ userId }).sort({ submittedAt: -1 }).lean();
  },

  /**
   * Get all claims for employer reviewer portal.
   */
  getEmployerClaims: async (employerId) => {
    const filter = employerId ? { employerId } : {};
    return await ClaimModel.find(filter).sort({ submittedAt: -1 }).lean();
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

    if (requestingUserId && claim.userId !== requestingUserId) {
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

