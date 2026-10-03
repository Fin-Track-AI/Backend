import { Router } from 'express';
import { retentionController } from '../controllers/retention.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Restrict retention purge operations to authorized compliance/security administration
router.post(
  '/purge-job',
  requireRole(['SECURITY_ADMIN', 'SYSTEM']),
  retentionController.triggerPurge
);

router.get(
  '/metrics',
  requireRole(['SECURITY_ADMIN', 'EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SYSTEM']),
  retentionController.getMetrics
);

export default router;
