import { insightEngineService } from '../services/insightEngine.service.js';

export const insightController = {
  getNudges: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const nudges = await insightEngineService.getProactiveNudges(userId);

      return res.status(200).json({
        success: true,
        count: nudges.length,
        data: nudges,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to fetch proactive nudges',
      });
    }
  },

  dismissNudge: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const { id } = req.params;

      const updated = await insightEngineService.dismissNudge(userId, id);
      return res.status(200).json({
        success: true,
        message: 'Nudge dismissed',
        data: updated,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to dismiss nudge',
      });
    }
  },
};
