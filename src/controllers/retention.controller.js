import { retentionService } from '../services/retention.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const retentionController = {
  /**
   * POST /api/v1/retention/purge-job
   * Triggers the automated data retention purge job (SCRUM-156).
   */
  triggerPurge: async (req, res) => {
    try {
      const { dryRun, targetDate } = req.body || {};

      // Security Guard: Prevent arbitrary future date purging that could wipe active records (SEC-006)
      const now = new Date();
      let evaluatedDate = now;

      if (targetDate) {
        const parsed = new Date(targetDate);
        if (isNaN(parsed.getTime())) {
          return ApiResponse.error(res, 'Invalid targetDate timestamp format', 400);
        }
        if (parsed > now) {
          return ApiResponse.error(
            res,
            'Security violation: targetDate cannot be set in the future. Active records under retention cannot be prematurely purged.',
            400,
            { code: 'FUTURE_PURGE_FORBIDDEN' }
          );
        }
        evaluatedDate = parsed;
      }

      const result = await retentionService.runPurgeJob({
        dryRun: Boolean(dryRun),
        targetDate: evaluatedDate,
      });

      return ApiResponse.success(res, 'Purge job executed successfully.', result);
    } catch (err) {
      console.error('[RetentionController triggerPurge Error]:', err);
      return ApiResponse.error(res, err.message, 500);
    }
  },

  /**
   * GET /api/v1/retention/metrics
   * Retrieves retention counts and statutory status.
   */
  getMetrics: async (req, res) => {
    try {
      const metrics = await retentionService.getRetentionMetrics();
      return ApiResponse.success(res, 'Retention compliance metrics retrieved.', metrics);
    } catch (err) {
      console.error('[RetentionController getMetrics Error]:', err);
      return ApiResponse.error(res, err.message, 500);
    }
  },
};
