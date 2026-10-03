import { Router } from 'express';
import { auditController } from '../controllers/audit.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Restrict access to cryptographic audit verification and raw audit logs to security administration
router.get(
  '/verify',
  requireRole(['SECURITY_ADMIN', 'SYSTEM']),
  auditController.verifyChain
);

router.get(
  '/logs',
  requireRole(['SECURITY_ADMIN', 'SYSTEM']),
  auditController.getLogs
);

export default router;
