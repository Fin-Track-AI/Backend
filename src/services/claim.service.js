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
    // 1. Verify or auto-link Employer
    let linkedEmployer = await employerService.getLinkedEmployer(userId);
    if (!linkedEmployer) {
      try {
        linkedEmployer = await employerService.linkEmployer(userId, {
          employerName: 'TechCorp Solutions India',
          employerId: 'emp_techcorp_2026',
          verificationStatus: 'VERIFIED',
        });
      } catch (_) {
        linkedEmployer = {
          employerId: 'emp_techcorp_2026',
          employerName: 'TechCorp Solutions India',
        };
      }
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
      } catch (_) {
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
      status: 'Pending',
      submittedAt: now,
      updatedAt: now,
    });

    return claimRecord.toObject();
  },

  /**
   * Get all claims across the company for Employer Dashboard review.
   * Enriches claims with employee details from UserModel.
   */
  getAllClaims: async (filter = {}) => {
    const claims = await ClaimModel.find(filter).sort({ submittedAt: -1 }).lean();

    // Fetch user profiles for all submitters
    const userIds = [...new Set(claims.map((c) => c.userId))];
    const users = await UserModel.find({
      $or: [{ _id: { $in: userIds.filter((id) => id.length === 24) } }, { email: { $in: userIds } }],
    }).lean();

    const userMap = {};
    for (const u of users) {
      userMap[u._id.toString()] = u;
      if (u.email) userMap[u.email] = u;
    }

    return claims.map((claim) => {
      const user = userMap[claim.userId] || {};
      const empName = user.name || user.fullName || (user.email ? user.email.split('@')[0] : 'Employee');
      const initials = empName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      // Normalize status
      let normStatus = claim.status || 'Pending';
      if (normStatus === 'Submitted') normStatus = 'Pending';
      if (normStatus === 'Reimbursed') normStatus = 'Paid';

      return {
        ...claim,
        id: claim.claimId || claim._id.toString(),
        employeeId: claim.userId,
        employeeName: empName,
        employeeEmail: user.email || 'employee@techcorp.in',
        employeePhone: user.phone || '',
        employeeAvatar: initials || 'EM',
        department: user.department || 'Engineering',
        status: normStatus,
        submissionDate: claim.submittedAt
          ? new Date(claim.submittedAt).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        expenseDate: claim.submittedAt
          ? new Date(claim.submittedAt).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
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
   * Update claim approval / rejection status
   */
  updateClaimStatus: async (claimId, { status, adminNotes, rejectionReason }) => {
    const claim = await ClaimModel.findOne({
      $or: [{ claimId }, { _id: claimId.length === 24 ? claimId : null }],
    });

    if (!claim) {
      const error = new Error(`Claim '${claimId}' not found.`);
      error.statusCode = 404;
      throw error;
    }

    if (status) {
      claim.status = status;
    }
    if (adminNotes !== undefined) {
      claim.adminNotes = adminNotes;
    }
    if (rejectionReason !== undefined) {
      claim.rejectionReason = rejectionReason;
    }
    claim.updatedAt = new Date();

    await claim.save();
    return claim.toObject();
  },

  /**
   * Get user's submitted claims list for "My Claims" view in Flutter.
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

    if (requestingUserId && claim.userId !== requestingUserId) {
      const error = new Error('Access denied: You do not own this claim.');
      error.statusCode = 403;
      error.code = 'TENANT_ISOLATION_VIOLATION';
      throw error;
    }

    return claim;
  },
};
