import { ApiResponse } from '../utils/apiResponse.js';
import { auditService } from '../services/audit.service.js';

/**
 * List of forbidden request parameter keys associated with direct fund movements,
 * banking payouts, automated debits, and payment gateway transfer APIs.
 * FinTrack AI is strictly a non-transactional ledger.
 */
export const FORBIDDEN_TRANSACTIONAL_KEYS = new Set([
  'payoutmethod',
  'beneficiaryaccount',
  'beneficiaryifsc',
  'initiatetransfer',
  'initiatepayout',
  'autodebitmandate',
  'disbursefunds',
  'paymentgatewaysecret',
  'bankwireid',
  'escrowaccountid',
  'directdebit',
  'gatewaytoken',
  'payoutaccount',
]);

/**
 * Recursively inspects payload objects or arrays to find any forbidden transactional parameter key.
 *
 * @param {*} data
 * @param {number} depth
 * @returns {string|null} - Name of the forbidden key if found, otherwise null
 */
export function findForbiddenKey(data, depth = 0) {
  if (!data || depth > 5 || typeof data !== 'object') {
    return null;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findForbiddenKey(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const key of Object.keys(data)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (FORBIDDEN_TRANSACTIONAL_KEYS.has(normalizedKey)) {
      return key;
    }
    const nestedFound = findForbiddenKey(data[key], depth + 1);
    if (nestedFound) {
      return nestedFound;
    }
  }

  return null;
}

/**
 * Express Middleware: Non-Transactional Boundary Safeguard (SCRUM-161)
 *
 * Enforces FinTrack AI's zero-custody, non-transactional boundary by intercepting
 * and blocking any incoming payload attempting to pass outbound payment parameters,
 * auto-debit mandates, or bank payout instructions.
 */
export const nonTransactionalSafeguard = (req, res, next) => {
  // Check request body, query parameters, and headers
  const forbiddenBodyKey = findForbiddenKey(req.body);
  const forbiddenQueryKey = findForbiddenKey(req.query);

  const detectedKey = forbiddenBodyKey || forbiddenQueryKey;

  if (detectedKey) {
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      '';

    const actor = {
      userId: req.user?.id || 'anonymous',
      role: req.user?.role || 'ANONYMOUS',
      ip: clientIp,
      userAgent: req.headers['user-agent'] || '',
    };

    // Log the security violation to the tamper-evident audit ledger
    auditService
      .logEvent({
        eventType: 'SYSTEM_EVENT',
        action: 'FUND_MOVEMENT_BLOCKED',
        actor,
        target: {
          resourceType: 'SECURITY_SAFEGUARD',
          resourceId: req.path,
        },
        metadata: {
          forbiddenKeyDetected: detectedKey,
          path: req.originalUrl || req.url,
          method: req.method,
          message: 'Blocked attempt to initiate fund movement or banking payout parameter.',
        },
      })
      .catch((err) => {
        console.warn('[Safeguard Audit Warning]:', err.message);
      });

    return ApiResponse.error(
      res,
      `Forbidden: FinTrack AI operates strictly as a non-transactional ledger. Automated fund movements and banking payout parameters ('${detectedKey}') are prohibited.`,
      403,
      {
        complianceStatus: 'NON_TRANSACTIONAL_VIOLATION',
        forbiddenKey: detectedKey,
        remediation: 'FinTrack AI does not disburse or transfer funds. Use company payroll or corporate banking for actual fund settlement.',
      }
    );
  }

  next();
};
