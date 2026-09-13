import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { handleUploadMiddleware } from '../middlewares/upload.middleware.js';
import { processBillOcr, uploadAndParseOcr } from '../controllers/ocr.controller.js';

const router = Router();

router.use(authenticate);

router.post('/process/:billId', processBillOcr);
router.post('/upload-and-parse', handleUploadMiddleware, uploadAndParseOcr);

export default router;
