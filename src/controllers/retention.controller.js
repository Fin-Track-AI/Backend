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

      const result = await retentionService.runPurgeJob({
        dryRun: Boolean(dryRun),
        targetDate: targetDate ? new Date(targetDate) : new Date(),
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
