import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { submitClaim, getMyClaims, getClaimDetails } from '../controllers/claim.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', submitClaim);
router.get('/my-claims', getMyClaims);
router.get('/:claimId', getClaimDetails);

export default router;
