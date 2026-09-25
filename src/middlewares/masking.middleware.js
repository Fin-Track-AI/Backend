/**
 * FinTrack AI - Non-Privileged View Masking Middleware (SCRUM-148)
 *
 * Intercepts outbound JSON responses for non-privileged users to guarantee that
 * raw UPI IDs, bank account numbers, phone numbers, and PANs are never exposed.
 */

import { dlpService } from '../services/dlp.service.js';

const PRIVILEGED_ROLES = new Set([
  'SYSTEM',
  'SECURITY_ADMIN',
  'SUPER_ADMIN',
  'FINANCE_CONTROLLER',
]);

export const nonPrivilegedMaskingMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    // If route handler requested explicit skip
    if (res.locals && res.locals.skipMasking) {
      res.setHeader('X-DLP-Masking', 'bypassed');
      return originalJson(body);
    }

    const role = req.user?.role || 'ANONYMOUS';

    // Privileged roles get unmasked raw view
    if (PRIVILEGED_ROLES.has(role)) {
      res.setHeader('X-DLP-Masking', 'privileged');
      return originalJson(body);
    }

    // Non-privileged users (USER, EMPLOYEE, ANONYMOUS, etc.)
    res.setHeader('X-DLP-Masking', 'applied');
    const sanitizedBody = dlpService.maskSensitiveData(body);
    return originalJson(sanitizedBody);
  };

  next();
};

export default nonPrivilegedMaskingMiddleware;
