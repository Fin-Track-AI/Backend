import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireConsent } from '../middlewares/consent.middleware.js';
import { handleUploadMiddleware } from '../middlewares/upload.middleware.js';
import { uploadBill, getBillMetadata, getBillImage, listUserBills } from '../controllers/bill.controller.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();

router.use(authenticate);
router.use(requireConsent('billStorageConsent'));

// Static routes FIRST
router.post('/upload', handleUploadMiddleware, uploadBill);
router.get('/', listUserBills);
router.get('/storage', (req, res) => {
  return ApiResponse.success(res, 'Stored bills fetched successfully', {
    bills: [
      { id: 'bill_1', biller: 'Electricity Board', amount: 850, dueDate: '2026-09-25' },
    ],
  });
});

// Dynamic parameterized routes LAST
router.get('/:billId', getBillMetadata);
router.get('/:billId/image', getBillImage);

export default router;
