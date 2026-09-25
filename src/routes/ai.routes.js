import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireConsent } from '../middlewares/consent.middleware.js';
import { handleAiChat } from '../controllers/ai.controller.js';
import { insightController } from '../controllers/insight.controller.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();

router.use(authenticate);
router.use(requireConsent('aiUsageConsent'));

router.post('/chat', handleAiChat);

router.get('/nudges', insightController.getNudges);
router.patch('/nudges/:id/dismiss', insightController.dismissNudge);

router.post('/insights', (req, res) => {
  return ApiResponse.success(res, 'AI Financial insights generated successfully', {
    insights: 'Your spending in dining out decreased by 15% this month. Great job!',
  });
});

export default router;

