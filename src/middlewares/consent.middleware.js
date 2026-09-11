import { consentService } from '../services/consent.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

/**
 * Middleware factory to enforce consent requirement.
 * BR-03: Revocation actually blocks the relevant data use, not just a UI toggle.
 * 
 * @param {string} consentType - 'upiConsent' | 'billStorageConsent' | 'aiUsageConsent'
 */
export const requireConsent = (consentType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || 'anonymous';
      const isGranted = await consentService.hasConsent(userId, consentType);

      if (!isGranted) {
        return ApiResponse.error(
          res,
          `Access denied: Consent for '${consentType}' is revoked or not granted.`,
          403,
          { consentType, status: 'REVOKED_OR_MISSING' }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
