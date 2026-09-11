import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireConsent } from '../middlewares/consent.middleware.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();

router.use(authenticate);
router.use(requireConsent('billStorageConsent'));

router.get('/storage', (req, res) => {
  return ApiResponse.success(res, 'Stored bills fetched successfully', {
    bills: [
      { id: 'bill_1', biller: 'Electricity Board', amount: 850, dueDate: '2026-09-25' },
    ],
  });
});

export default router;
