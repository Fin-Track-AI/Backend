import { Router } from 'express';
import { retentionController } from '../controllers/retention.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.post('/purge-job', retentionController.triggerPurge);
router.get('/metrics', retentionController.getMetrics);

export default router;
