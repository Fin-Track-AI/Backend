import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  submitClaim,
  getMyClaims,
  getClaimDetails,
  updateClaimStatus,
  getEmployerClaims,
} from '../controllers/claim.controller.js';

const router = Router();

// Public/employer review routes (can bypass strict user auth or use authenticate)
router.get('/employer/all', getEmployerClaims);
router.patch('/:claimId/status', updateClaimStatus);

router.use(authenticate);

router.post('/', submitClaim);
router.get('/my-claims', getMyClaims);
router.get('/:claimId', getClaimDetails);

export default router;

