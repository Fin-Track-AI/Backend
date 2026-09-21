import { employerService } from '../services/employer.service.js';
import { UserModel } from '../models/user.model.js';
import { ClaimModel } from '../models/claim.model.js';
import { ApiResponse } from '../utils/apiResponse.js';

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

export const getCompanyEmployees = async (req, res, next) => {
  try {
    const users = await UserModel.find().sort({ createdAt: -1 }).lean();
    const claims = await ClaimModel.find().lean();

    const employees = users.map((user) => {
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
        department: user.department || 'Engineering',
        role: user.role || 'Software Engineer',
        status: 'Active',
        monthlyAllowance: user.salary ? Math.round(user.salary * 0.3) : 35000,
        totalReimbursed,
        claimsCount: userClaims.length,
        avatar:
          name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'EM',
        joinedDate: user.createdAt
          ? new Date(user.createdAt).toISOString().split('T')[0]
          : '2024-04-01',
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
