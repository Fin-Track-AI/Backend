import { employerService } from '../services/employer.service.js';
import { UserModel } from '../models/user.model.js';
import { ClaimModel } from '../models/claim.model.js';
import { EmployerModel } from '../models/employer.model.js';
import { ApiResponse } from '../utils/apiResponse.js';

/**
 * Generate a new unique employee invite code (Employer Dashboard)
 */
export const generateInviteCode = async (req, res, next) => {
  try {
    const {
      companyId,
      companyName,
      department,
      monthlyAllowance,
      role,
      expiryDays,
    } = req.body;
    const createdBy = req.user?.name || req.user?.email || 'Admin';

    const invite = await employerService.generateInviteCode({
      companyId,
      companyName,
      department,
      monthlyAllowance,
      role,
      createdBy,
      expiryDays,
    });

    return ApiResponse.success(res, 'Invite code generated successfully', invite, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * List all invite codes generated for a company (Employer Dashboard)
 */
export const getCompanyInviteCodes = async (req, res, next) => {
  try {
    const { companyId } = req.query;
    const invites = await employerService.getCompanyInviteCodes(companyId);
    return ApiResponse.success(res, 'Company invite codes retrieved', {
      invites,
      total: invites.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify an invite code (Mobile App - before joining)
 */
export const verifyInviteCode = async (req, res, next) => {
  try {
    const { code } = req.body;
    const verified = await employerService.verifyInviteCode(code);
    return ApiResponse.success(res, 'Invite code is valid', verified);
  } catch (error) {
    if (error.statusCode) {
      return ApiResponse.error(res, error.message, error.statusCode, { code: error.code });
    }
    next(error);
  }
};

/**
 * Claim an invite code and join the organization (Mobile App)
 */
export const claimInviteCode = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return ApiResponse.error(res, 'User authentication required to join company', 401);
    }

    const { code, name, email, phone, employeeId } = req.body;
    const result = await employerService.claimInviteCode(userId, code, {
      name: name || req.user?.name,
      email: email || req.user?.email,
      phone: phone || req.user?.phone,
      employeeId,
    });

    return ApiResponse.success(
      res,
      `Successfully joined ${result.linkedEmployer.employerName}!`,
      result,
      201
    );
  } catch (error) {
    if (error.statusCode) {
      return ApiResponse.error(res, error.message, error.statusCode, { code: error.code });
    }
    next(error);
  }
};

/**
 * Get currently linked company for the mobile user
 */
export const getMyCompany = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const linked = await employerService.getLinkedEmployer(userId);

    if (!linked) {
      return ApiResponse.success(res, 'No company currently linked', {
        isLinked: false,
        company: null,
      });
    }

    return ApiResponse.success(res, 'Company details retrieved', {
      isLinked: true,
      company: linked,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Link employer directly
 */
export const linkEmployer = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { employerName, corporateEmail, employeeId } = req.body;

    if (!employerName) {
      return ApiResponse.error(res, 'Employer name is required', 400);
    }

    const linkedEmployer = await employerService.linkEmployer(userId, {
      employerName,
      corporateEmail,
      employeeId,
    });

    return ApiResponse.success(res, 'Employer linked successfully', linkedEmployer, 201);
  } catch (error) {
    if (error.code === 'EMPLOYER_ALREADY_LINKED') {
      return ApiResponse.error(res, error.message, 400, { code: error.code });
    }
    next(error);
  }
};

/**
 * Get linked employer
 */
export const getLinkedEmployer = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const employer = await employerService.getLinkedEmployer(userId);

    if (!employer) {
      return ApiResponse.success(res, 'No employer currently linked', { linked: false });
    }

    return ApiResponse.success(res, 'Linked employer details retrieved', { linked: true, employer });
  } catch (error) {
    next(error);
  }
};

/**
 * Unlink employer
 */
export const unlinkEmployer = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    await employerService.unlinkEmployer(userId);
    return ApiResponse.success(res, 'Employer unlinked successfully');
  } catch (error) {
    if (error.code === 'NO_LINKED_EMPLOYER') {
      return ApiResponse.error(res, error.message, 404, { code: error.code });
    }
    next(error);
  }
};

/**
 * Get company employees for the employer dashboard
 */
export const getCompanyEmployees = async (req, res, next) => {
  try {
    const users = await UserModel.find().sort({ createdAt: -1 }).lean();
    const claims = await ClaimModel.find().lean();
    const linkedEmployers = await EmployerModel.find().lean();

    const employerMap = new Map();
    linkedEmployers.forEach((le) => {
      employerMap.set(le.userId, le);
    });

    // Only include users who have actually linked to this employer
    const enrolledUsers = users.filter((u) => employerMap.has(u._id.toString()));

    const employees = enrolledUsers.map((user) => {
      const empLink = employerMap.get(user._id.toString());
      const userClaims = claims.filter(
        (c) => c.userId === user._id.toString() || c.userId === user.email
      );
      const approvedClaims = userClaims.filter((c) =>
        ['Approved', 'Paid', 'Reimbursed'].includes(c.status)
      );
      const totalReimbursed = approvedClaims.reduce((sum, c) => sum + (c.amount || 0), 0);
      const name = user.name || user.fullName || user.email.split('@')[0];

      return {
        id: user._id.toString(),
        name,
        email: user.email,
        phone: user.phone || '+91 98000 00000',
        department: empLink?.department || 'Engineering',
        role: empLink?.role || 'Team Member',
        status: 'Active',
        monthlyAllowance: empLink?.monthlyAllowance || 25000,
        totalReimbursed,
        claimsCount: userClaims.length,
        avatar:
          name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'EM',
        joinedDate: empLink?.linkedAt
          ? new Date(empLink.linkedAt).toISOString().split('T')[0]
          : '2026-09-23',
      };
    });

    return ApiResponse.success(res, 'Company employees retrieved', {
      employees,
      total: employees.length,
    });
  } catch (error) {
    next(error);
  }
};
