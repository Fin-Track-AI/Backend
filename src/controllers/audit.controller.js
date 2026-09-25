import { auditService } from '../services/audit.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const auditController = {
  /**
   * GET /api/v1/audit/verify
   * Cryptographically verifies the audit log chain from end to end (SCRUM-166).
   */
  verifyChain: async (req, res) => {
    try {
      const fromSequence = req.query.from ? parseInt(req.query.from, 10) : 1;
      const toSequence = req.query.to ? parseInt(req.query.to, 10) : null;

      const result = await auditService.verifyAuditChain({
        fromSequence,
        toSequence,
      });

      if (!result.isValid) {
        return ApiResponse.error(
          res,
          'Audit log cryptographic chain verification failed! Tampering detected.',
          409,
          result
        );
      }

      return ApiResponse.success(
        res,
        'Audit log cryptographic chain is valid and untampered.',
        result
      );
    } catch (err) {
      console.error('[AuditController verifyChain Error]:', err);
      return ApiResponse.error(res, err.message, 500);
    }
  },

  /**
   * GET /api/v1/audit/logs
   * Retrieves paginated audit logs with optional filters.
   */
  getLogs: async (req, res) => {
    try {
      const page = req.query.page ? parseInt(req.query.page, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      const { eventType, action, userId, resourceType, resourceId } = req.query;

      const logsData = await auditService.getAuditLogs({
        page,
        limit,
        eventType,
        action,
        userId,
        resourceType,
        resourceId,
      });

      return ApiResponse.success(res, 'Audit logs retrieved successfully.', logsData);
    } catch (err) {
      console.error('[AuditController getLogs Error]:', err);
      return ApiResponse.error(res, err.message, 500);
    }
  },
};
