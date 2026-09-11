import { employerService } from '../services/employer.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const linkEmployer = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
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
    const userId = req.user?.id || 'anonymous';
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
    const userId = req.user?.id || 'anonymous';
    await employerService.unlinkEmployer(userId);
    return ApiResponse.success(res, 'Employer unlinked successfully');
  } catch (error) {
    if (error.code === 'NO_LINKED_EMPLOYER') {
      return ApiResponse.error(res, error.message, 404, { code: error.code });
    }
    next(error);
  }
};
