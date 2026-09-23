import { ClaimModel } from '../models/claim.model.js';
import { UserModel } from '../models/user.model.js';
import { employerService } from './employer.service.js';
import { billService } from './bill.service.js';

export const claimService = {
  /**
   * Submit a new reimbursement claim.
   * Auto-links default employer if not yet linked.
   */
  submitClaim: async (userId, claimData) => {
    // 1. Verify Employer Linkage
    let linkedEmployer = await employerService.getLinkedEmployer(userId);
    if (!linkedEmployer) {
      const error = new Error('You must join your organization via an invite code before submitting reimbursement claims.');
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

    // 3. Resolve attached bill if available
    let billStorageKey = 'receipt_stored';
    let resolvedBillId = billId || 'manual_entry';

    if (billId && billId !== 'manual_entry') {
      try {
        const billRecord = await billService.getBillById(billId, userId);
        if (billRecord) {
          billStorageKey = billRecord.storageKey || 'receipt_stored';
          resolvedBillId = billRecord.billId;
        }
      } catch {
        // Fallback gracefully
        resolvedBillId = billId;
      }
    }

    const claimId = `claim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const now = new Date();

    const claimRecord = await ClaimModel.create({
      claimId,
      userId,
      employerId: linkedEmployer.employerId || 'emp_techcorp_2026',
      employerName: linkedEmployer.employerName || 'TechCorp Solutions India',
      title: title.trim(),
      amount: Number(amount),
      category: (category || 'General').trim(),
      project: (project || 'Project Alpha').trim(),
      costCenter: (costCenter || 'CC-102-FINANCE').trim(),
      billId: resolvedBillId,
      billStorageKey,
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
      Pending: ['In Review', 'Approved', 'Rejected', 'Info Requested'],
      'In Review': ['Approved', 'Rejected', 'Info Requested'],
      'Info Requested': ['Submitted', 'Pending', 'In Review', 'Approved', 'Rejected'],
      Approved: ['Reimbursed', 'Paid', 'Rejected'],
      Rejected: ['In Review', 'Submitted', 'Pending'],
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
   * Get all claims formatted for employer dashboard, enriched with user profiles.
   */
  getAllClaims: async (filter = {}) => {
    const claims = await ClaimModel.find(filter).sort({ submittedAt: -1 }).lean();

    // Fetch user profiles for all submitters
    const userIds = [...new Set(claims.map((c) => c.userId))];
    const users = await UserModel.find({
      $or: [{ _id: { $in: userIds.filter((id) => id && id.length === 24) } }, { email: { $in: userIds } }],
    }).lean();

    const userMap = {};
    for (const u of users) {
      userMap[u._id.toString()] = u;
      if (u.email) {
        userMap[u.email] = u;
      }
    }

    return claims.map((claim) => {
      const user = userMap[claim.userId] || {};
      const empName = user.name || user.fullName || claim.employeeName || (user.email ? user.email.split('@')[0] : 'Employee');
      const initials = empName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      // Normalize status
      let normStatus = claim.status || 'Pending';
      if (normStatus === 'Submitted') {
        normStatus = 'Pending';
      }
      if (normStatus === 'Reimbursed') {
        normStatus = 'Paid';
      }

      return {
        id: claim.claimId || claim._id.toString(),
        claimId: claim.claimId || claim._id.toString(),
        employeeId: claim.userId,
        employeeName: empName,
        employeeEmail: user.email || (claim.userId ? `${claim.userId}@company.com` : 'employee@company.com'),
        employeePhone: user.phone || '',
        employeeAvatar: initials || (claim.title || 'EM').slice(0, 2).toUpperCase(),
        department: user.department || 'Operations',
        title: claim.title,
        amount: claim.amount,
        category: claim.category || 'General',
        project: claim.project || 'Operations',
        costCenter: claim.costCenter || 'CC-100',
        status: normStatus,
        rawStatus: claim.status || 'Submitted',
        submissionDate: claim.submittedAt
          ? new Date(claim.submittedAt).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        expenseDate: claim.submittedAt
          ? new Date(claim.submittedAt).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        adminNotes: claim.adminNotes || '',
        rejectionReason: claim.rejectionReason || '',
        requestedInfoNote: claim.requestedInfoNote || '',
        receipt: {
          merchant: claim.title || 'Merchant Receipt',
          invoiceNumber: `INV-${(claim.claimId || claim._id.toString()).slice(-6).toUpperCase()}`,
          gstin: '27AABCT3518Q1Z9',
          date: claim.submittedAt
            ? new Date(claim.submittedAt).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          amount: claim.amount,
          tax: Math.round(claim.amount * 0.05),
          isReimbursable: true,
          fileName: claim.billStorageKey ? `${claim.billStorageKey}.pdf` : 'Receipt_Attachment.pdf',
        },
      };
    });
  },

  /**
   * Update claim approval / rejection / info request status (BR-13 & BR-14)
   */
  updateClaimStatus: async (claimId, statusOrPayload, noteParam = '', reviewerId = 'Admin Reviewer') => {
    const claim = await ClaimModel.findOne({
      $or: [{ claimId }, { _id: claimId.length === 24 ? claimId : null }],
    });

    if (!claim) {
      const error = new Error(`Claim '${claimId}' not found.`);
      error.statusCode = 404;
      throw error;
    }

    let newStatus, adminNotes, rejectionReason, requestedInfoNote, note, reviewer;
    if (typeof statusOrPayload === 'object' && statusOrPayload !== null) {
      newStatus = statusOrPayload.status;
      adminNotes = statusOrPayload.adminNotes || statusOrPayload.note;
      rejectionReason = statusOrPayload.rejectionReason || statusOrPayload.reason;
      requestedInfoNote = statusOrPayload.requestedInfoNote || statusOrPayload.note;
      reviewer = statusOrPayload.reviewerId || reviewerId;
      note = statusOrPayload.note || statusOrPayload.adminNotes || statusOrPayload.rejectionReason || '';
    } else {
      newStatus = statusOrPayload;
      note = noteParam;
      reviewer = reviewerId;
      adminNotes = noteParam;
      rejectionReason = noteParam;
      requestedInfoNote = noteParam;
    }

    if (newStatus) {
      claimService.validateStatusTransition(claim.status, newStatus);
      claim.status = newStatus;
    }

    claim.updatedAt = new Date();
    claim.reviewerId = reviewer;

    if (newStatus === 'Rejected') {
      claim.rejectionReason = rejectionReason || note || 'Not compliant with policy.';
    } else if (newStatus === 'Info Requested') {
      claim.requestedInfoNote = requestedInfoNote || note || 'Additional information or documents required.';
    }

    if (adminNotes !== undefined) {
      claim.adminNotes = adminNotes;
    }

    if (!claim.history) {
      claim.history = [];
    }

    claim.history.push({
      status: claim.status,
      timestamp: new Date(),
      note: note || `Status updated to ${claim.status}`,
      updatedBy: reviewer,
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
};
