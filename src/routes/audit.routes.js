import { Router } from 'express';
import { auditController } from '../controllers/audit.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// In development or testing, authenticate middleware allows token bypasses or admin access
router.get('/verify', authenticate, auditController.verifyChain);
router.get('/logs', authenticate, auditController.getLogs);

export default router;
