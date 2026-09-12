import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireConsent } from '../middlewares/consent.middleware.js';
import { handleUploadMiddleware } from '../middlewares/upload.middleware.js';
import { processBillOcr, uploadAndParseOcr } from '../controllers/ocr.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireConsent('aiUsageConsent'));
router.use(requireConsent('billStorageConsent'));

router.post('/process/:billId', processBillOcr);
router.post('/upload-and-parse', handleUploadMiddleware, uploadAndParseOcr);

export default router;
