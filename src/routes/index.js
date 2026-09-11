import { Router } from 'express';
import authRoutes from './auth.routes.js';
import transactionRoutes from './transaction.routes.js';
import healthRoutes from './health.routes.js';
import employerRoutes from './employer.routes.js';
import consentRoutes from './consent.routes.js';
import upiRoutes from './upi.routes.js';
import billsRoutes from './bills.routes.js';
import aiRoutes from './ai.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/transactions', transactionRoutes);
router.use('/employer', employerRoutes);
router.use('/consent', consentRoutes);
router.use('/upi', upiRoutes);
router.use('/bills', billsRoutes);
router.use('/ai', aiRoutes);

export default router;
