import { Router } from 'express';
import {
  generateInviteCode,
  getCompanyInviteCodes,
  verifyInviteCode,
  claimInviteCode,
  getMyCompany,
  linkEmployer,
  getLinkedEmployer,
  unlinkEmployer,
  getCompanyEmployees,
} from '../controllers/employer.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

// Public / Pre-auth verification for employees joining with a code
router.post('/invites/verify', verifyInviteCode);

// Enforce authentication for all remaining employer routes
router.use(authenticate);

// 1. Employer & Admin Management Routes (Restricted by Role)
router.post(
  '/invites/generate',
  requireRole(['EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN', 'SYSTEM']),
  generateInviteCode
);

router.get(
  '/invites',
  requireRole(['EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN', 'SYSTEM']),
  getCompanyInviteCodes
);

router.get(
  '/employees',
  requireRole(['EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN', 'SYSTEM']),
  getCompanyEmployees
);

// 2. Employee Mobile Routes (Authenticated users)
router.post('/invites/claim', claimInviteCode);
router.get('/my-company', getMyCompany);
router.post('/link', linkEmployer);
router.get('/', getLinkedEmployer);
router.delete('/unlink', unlinkEmployer);

export default router;
