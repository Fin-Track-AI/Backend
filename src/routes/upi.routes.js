import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireConsent } from '../middlewares/consent.middleware.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();

router.use(authenticate);
router.use(requireConsent('upiConsent'));

router.get('/transactions', (req, res) => {
  return ApiResponse.success(res, 'UPI transactions fetched successfully', {
    transactions: [
      { id: 'upi_1', upiId: 'user@upi', amount: 150, status: 'SUCCESS' },
    ],
  });
});

export default router;
