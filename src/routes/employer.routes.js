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
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Public / Pre-auth verification
router.post('/invites/verify', verifyInviteCode);

// Employer Dashboard Routes (invite generation & tracking)
router.post('/invites/generate', generateInviteCode);
router.get('/invites', getCompanyInviteCodes);
router.get('/employees', getCompanyEmployees);

// Employee Mobile Routes (Authenticated)
router.use(authenticate);
router.post('/invites/claim', claimInviteCode);
router.get('/my-company', getMyCompany);
router.post('/link', linkEmployer);
router.get('/', getLinkedEmployer);
router.delete('/unlink', unlinkEmployer);

export default router;
