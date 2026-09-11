import { consentService } from '../services/consent.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const getConsents = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const consentRecord = await consentService.getUserConsents(userId);
    return ApiResponse.success(res, 'User consent settings retrieved', consentRecord);
  } catch (error) {
    next(error);
  }
};

export const updateConsents = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const { upiConsent, billStorageConsent, aiUsageConsent } = req.body;

    const updatedRecord = await consentService.updateConsents(userId, {
      upiConsent,
      billStorageConsent,
      aiUsageConsent,
    });

    return ApiResponse.success(res, 'Consent flags updated successfully', updatedRecord);
  } catch (error) {
    next(error);
  }
};

export const revokeConsent = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const { consentType } = req.params;

    const updatedRecord = await consentService.revokeConsent(userId, consentType);
    return ApiResponse.success(res, `Consent for '${consentType}' revoked successfully`, updatedRecord);
  } catch (error) {
    if (error.code === 'INVALID_CONSENT_TYPE') {
      return ApiResponse.error(res, error.message, 400);
    }
    next(error);
  }
};
