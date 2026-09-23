import { claimService } from '../services/claim.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import fs from 'fs';

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

    try {
      const { Notification } = await import('../models/notification.model.js');
      await Notification.create({
        userId: updatedClaim.userId,
        title: `Claim ${targetStatus}: ${updatedClaim.title}`,
        body: `Your reimbursement claim for ₹${updatedClaim.amount} has been ${targetStatus.toLowerCase()}.${adminNotes || rejectionReason ? ` Note: ${adminNotes || rejectionReason}` : ''}`,
        type: 'claim',
        data: {
          claimId: updatedClaim._id?.toString(),
          status: targetStatus,
          amount: updatedClaim.amount,
        },
      });
    } catch (_) {}

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

export const clearAllClaims = async (req, res, next) => {
  try {
    const employerId = req.query.employerId || null;
    const result = await claimService.clearAllClaims(employerId);
    return ApiResponse.success(res, 'All demo claims cleared successfully', result);
  } catch (error) {
    next(error);
  }
};

export const deleteClaim = async (req, res, next) => {
  try {
    const { claimId } = req.params;
    const result = await claimService.deleteClaim(claimId);
    return ApiResponse.success(res, 'Claim deleted successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getClaimReceiptImage = async (req, res, next) => {
  try {
    const { claimId } = req.params;
    const { filePath, mimeType, originalName } = await claimService.getClaimReceiptImageFile(claimId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    if (error.statusCode === 404) {
      return ApiResponse.error(res, error.message, 404);
    }
    next(error);
  }
};


