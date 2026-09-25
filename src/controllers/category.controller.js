import { categorizationService } from '../services/categorization.service.js';

export const categoryController = {
  recategorizeTransaction: async (req, res) => {
    try {
      const userId = req.user.id || req.user._id;
      const { transactionId, newCategory, applyToFuture } = req.body;

      if (!transactionId || !newCategory) {
        return res.status(400).json({
          success: false,
          message: 'transactionId and newCategory are required.',
        });
      }

      const result = await categorizationService.recategorizeTransaction({
        userId,
        transactionId,
        newCategory,
        applyToFuture: applyToFuture !== false,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Failed to recategorize transaction',
      });
    }
  },
};
