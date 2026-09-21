import { claimService } from '../services/claim.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const submitClaim = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { title, amount, category, project, costCenter, billId } = req.body;

    const claimRecord = await claimService.submitClaim(userId, {
      title,
      amount,
      category,
      project,
      costCenter,
      billId,
    });

    return ApiResponse.success(res, 'Reimbursement claim submitted successfully', claimRecord, 201);
  } catch (error) {
    if (error.code === 'NO_LINKED_EMPLOYER' || error.code?.startsWith('MISSING_')) {
      return ApiResponse.error(res, error.message, 400, { code: error.code });
    }
    next(error);
  }
};

export const getAllClaims = async (req, res, next) => {
  try {
    const claims = await claimService.getAllClaims();
    return ApiResponse.success(res, 'Claims retrieved successfully', {
      claims,
      total: claims.length,
    });
  } catch (error) {
    next(error);
  }
};

export const updateClaimStatus = async (req, res, next) => {
  try {
    const { claimId } = req.params;
    const { status, adminNotes, rejectionReason, note } = req.body;
    const reviewerId = req.user?.id || 'Admin Reviewer';

    const targetStatus = status || req.body.newStatus;
    if (!targetStatus) {
      return ApiResponse.error(res, 'Target status is required', 400);
    }

    const updatedClaim = await claimService.updateClaimStatus(claimId, {
      status: targetStatus,
      adminNotes: adminNotes || note,
      rejectionReason,
      note: note || adminNotes || rejectionReason,
      reviewerId,
    });

    return ApiResponse.success(
      res,
      `Claim status successfully updated to ${targetStatus}`,
      updatedClaim
    );
  } catch (error) {
    if (error.code === 'INVALID_STATE_TRANSITION') {
      return ApiResponse.error(res, error.message, 400, { code: error.code });
    }
    next(error);
  }
};

export const getEmployerClaims = async (req, res, next) => {
  try {
    const employerId = req.query.employerId || null;
    const claims = await claimService.getEmployerClaims(employerId);
    return ApiResponse.success(res, 'Employer claims retrieved successfully', { claims });
  } catch (error) {
    next(error);
  }
};

export const getMyClaims = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const claims = await claimService.getUserClaims(userId);
    return ApiResponse.success(res, 'User claims retrieved successfully', { claims });
  } catch (error) {
    next(error);
  }
};

export const getClaimDetails = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { claimId } = req.params;

    const claimRecord = await claimService.getClaimById(claimId, userId);
    return ApiResponse.success(res, 'Claim details retrieved successfully', claimRecord);
  } catch (error) {
    next(error);
  }
};

