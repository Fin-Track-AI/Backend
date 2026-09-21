import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  submitClaim,
  getAllClaims,
  updateClaimStatus,
  getMyClaims,
  getClaimDetails,
} from '../controllers/claim.controller.js';

const router = Router();

// 1. Employer Dashboard Routes (Accessible by authorized dashboard)
router.get('/', getAllClaims);
router.patch('/:claimId/status', updateClaimStatus);
router.post('/:claimId/approve', (req, res, next) => {
  req.body.status = 'Approved';
  return updateClaimStatus(req, res, next);
});
router.post('/:claimId/reject', (req, res, next) => {
  req.body.status = 'Rejected';
  return updateClaimStatus(req, res, next);
});

// 2. Employee Routes (Require authentication from Flutter app)
router.post('/', authenticate, submitClaim);
router.get('/my-claims', authenticate, getMyClaims);
router.get('/:claimId', authenticate, getClaimDetails);

export default router;
