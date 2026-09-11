import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireConsent } from '../middlewares/consent.middleware.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();

router.use(authenticate);
router.use(requireConsent('aiUsageConsent'));

router.post('/insights', (req, res) => {
  return ApiResponse.success(res, 'AI Financial insights generated successfully', {
    insights: 'Your spending in dining out decreased by 15% this month. Great job!',
  });
});

export default router;
