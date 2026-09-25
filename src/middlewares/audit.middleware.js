import { auditService } from '../services/audit.service.js';

/**
 * Express Middleware for logging sensitive data access events (SCRUM-165).
 * Captures reader identity, target resource, client IP, and user-agent.
 * Executes asynchronously to avoid adding latency to read operations.
 *
 * @param {string} resourceType - e.g. 'CLAIM', 'RECEIPT', 'STATEMENT', 'USER_PROFILE'
 * @param {string} [actionName] - Custom action label, defaults to `${resourceType}_ACCESSED`
 * @param {Function} [resolveResourceId] - Custom callback to extract resource ID from req
 */
export const auditDataAccess = (
  resourceType,
  actionName = null,
  resolveResourceId = null
) => {
  return (req, res, next) => {
    // Determine action name
    const action = actionName || `${resourceType}_ACCESSED`;

    // Extract target ID
    let resourceId = '';
    if (typeof resolveResourceId === 'function') {
      try {
        resourceId = resolveResourceId(req);
      } catch {
        resourceId = '';
      }
    } else if (req.params.claimId) {
      resourceId = req.params.claimId;
    } else if (req.params.id) {
      resourceId = req.params.id;
    } else if (req.params.userId) {
      resourceId = req.params.userId;
    }

    // Resolve client IP
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      '';

    const actor = {
      userId: req.user?.id || req.user?.userId || 'anonymous',
      role: req.user?.role || (req.user?.id ? 'USER' : 'ANONYMOUS'),
      email: req.user?.email || '',
      ip: clientIp,
      userAgent: req.headers['user-agent'] || '',
    };

    const target = {
      resourceType,
      resourceId: String(resourceId || 'collection'),
    };

    const metadata = {
      path: req.originalUrl || req.url,
      method: req.method,
      query: req.query || {},
    };

    // Log event in background to prevent read latency
    auditService
      .logDataAccess({
        action,
        actor,
        target,
        metadata,
      })
      .catch((err) => {
        console.warn(`[Audit Middleware Warning]: Could not log access to ${resourceType}:`, err.message);
      });

    next();
  };
};
