import { EmployerModel } from '../models/employer.model.js';
import { InviteCodeModel } from '../models/inviteCode.model.js';

export const employerService = {
  /**
   * Generate an enterprise employee invite code.
   */
  generateInviteCode: async ({
    companyId,
    companyName,
    department = 'Engineering',
    monthlyAllowance = 25000,
    role = 'Associate',
    createdBy = 'Admin',
    expiryDays = 30,
  }) => {
    if (!companyName) {
      const err = new Error('Company name is required to generate invite code');
      err.statusCode = 400;
      throw err;
    }

    // Generate prefix from company name e.g. "TC" or "TECH"
    const prefix = companyName
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase() || 'ORG';

    // Generate random 4 digits + 2 chars e.g. TC-8492-K9
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const randChars = Math.random().toString(36).substring(2, 4).toUpperCase();
    const code = `${prefix}-${randNum}-${randChars}`;

    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const inviteRecord = await InviteCodeModel.create({
      code,
      companyId: companyId || `COMP-${Date.now().toString().slice(-4)}`,
      companyName,
      department,
      monthlyAllowance: Number(monthlyAllowance) || 25000,
      role,
      createdBy,
      expiresAt,
    });

    return inviteRecord.toObject();
  },

  /**
   * Get all invite codes generated for a company.
   */
  getCompanyInviteCodes: async (companyId) => {
    const query = companyId ? { companyId } : {};
    return InviteCodeModel.find(query).sort({ createdAt: -1 }).lean();
  },

  /**
   * Verify an invite code before joining.
   */
  verifyInviteCode: async (rawCode, userId = null) => {
    if (!rawCode || !rawCode.trim()) {
      const err = new Error('Invite code is required.');
      err.statusCode = 400;
      throw err;
    }

    const cleanCode = rawCode.trim().toUpperCase();
    const invite = await InviteCodeModel.findOne({ code: cleanCode });

    if (!invite) {
      const err = new Error('Invalid invite code. Please check with your employer.');
      err.statusCode = 404;
      err.code = 'INVALID_INVITE_CODE';
      throw err;
    }

    if (invite.status === 'CLAIMED') {
      // Allow retry if this exact user already claimed it previously but failed to complete linking
      const isClaimedBySameUser =
        userId && invite.claimedBy?.userId && invite.claimedBy.userId.toString() === userId.toString();

      if (isClaimedBySameUser) {
        const existingLink = await EmployerModel.findOne({ userId });
        if (existingLink) {
          const err = new Error('You have already joined this organization.');
          err.statusCode = 400;
          err.code = 'EMPLOYER_ALREADY_LINKED';
          throw err;
        }
        // Link does not exist yet; permit re-claim/verification
      } else {
        const err = new Error('This invite code has already been claimed by another employee.');
        err.statusCode = 400;
        err.code = 'INVITE_ALREADY_CLAIMED';
        throw err;
      }
    }

    if (invite.status === 'REVOKED') {
      const err = new Error('This invite code has been revoked by your employer.');
      err.statusCode = 400;
      err.code = 'INVITE_REVOKED';
      throw err;
    }

    if (new Date() > new Date(invite.expiresAt)) {
      invite.status = 'EXPIRED';
      await invite.save();
      const err = new Error('This invite code has expired. Request a new code from Finance.');
      err.statusCode = 400;
      err.code = 'INVITE_EXPIRED';
      throw err;
    }

    return {
      valid: true,
      code: invite.code,
      companyId: invite.companyId,
      companyName: invite.companyName,
      department: invite.department,
      monthlyAllowance: invite.monthlyAllowance,
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  },

  /**
   * Claim an invite code and join the organization.
   */
  claimInviteCode: async (userId, rawCode, userDetails = {}) => {
    const cleanCode = rawCode.trim().toUpperCase();
    const verification = await employerService.verifyInviteCode(rawCode, userId);

    // Check if user already linked to an employer
    const existing = await EmployerModel.findOne({ userId });
    if (existing) {
      const err = new Error(
        `You are already affiliated with ${existing.employerName}. Please unlink your current organization before joining a new one.`
      );
      err.statusCode = 400;
      err.code = 'EMPLOYER_ALREADY_LINKED';
      throw err;
    }

    // Mark invite as claimed (or update existing claim for this user)
    const updatedInvite = await InviteCodeModel.findOneAndUpdate(
      {
        code: cleanCode,
        $or: [
          { status: 'ACTIVE' },
          { status: 'CLAIMED', 'claimedBy.userId': userId },
        ],
      },
      {
        status: 'CLAIMED',
        claimedBy: {
          userId,
          name: userDetails.name || 'Employee',
          email: userDetails.email || null,
          phone: userDetails.phone || null,
          claimedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!updatedInvite) {
      const err = new Error('Invite code could not be claimed. Please try again.');
      err.statusCode = 400;
      throw err;
    }

    // Create linked employer entry for user (with rollback on error)
    let linked;
    try {
      linked = await EmployerModel.create({
        userId,
        employerId: verification.companyId,
        employerName: verification.companyName,
        corporateEmail: userDetails.email || null,
        employeeId: userDetails.employeeId || `EMP-${Date.now().toString().slice(-4)}`,
        verificationStatus: 'VERIFIED',
        department: verification.department,
        monthlyAllowance: verification.monthlyAllowance,
        role: verification.role,
        linkedAt: new Date(),
      });
    } catch (createErr) {
      // Rollback invite code status if creation failed
      await InviteCodeModel.updateOne(
        { code: cleanCode },
        {
          status: 'ACTIVE',
          claimedBy: { userId: null, name: null, email: null, phone: null, claimedAt: null },
        }
      );
      throw createErr;
    }

    return {
      success: true,
      linkedEmployer: linked.toObject(),
      invite: updatedInvite.toObject(),
    };
  },

  /**
   * Link an employer to a user (Direct API).
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
   * Helper to clear store for testing.
   */
  _clearStore: async () => {
    await EmployerModel.deleteMany({});
    await InviteCodeModel.deleteMany({});
  },
};
