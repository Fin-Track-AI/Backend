import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { auditDataAccess } from '../middlewares/audit.middleware.js';
import {
  submitClaim,
  getAllClaims,
  getEmployerClaims,
  updateClaimStatus,
  getMyClaims,
  getClaimDetails,
  clearAllClaims,
  deleteClaim,
  getClaimReceiptImage,
} from '../controllers/claim.controller.js';

const router = Router();

// 1. Employer Dashboard Routes (Accessible by authorized dashboard)
router.get('/', auditDataAccess('CLAIM', 'CLAIM_LIST_VIEWED'), getAllClaims);
router.get('/employer/all', auditDataAccess('CLAIM', 'EMPLOYER_CLAIMS_VIEWED'), getEmployerClaims);
router.get('/:claimId/receipt-image', auditDataAccess('RECEIPT', 'RECEIPT_IMAGE_ACCESSED'), getClaimReceiptImage);
router.delete('/clear-all', clearAllClaims);
router.delete('/:claimId', deleteClaim);
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
router.get('/my-claims', authenticate, auditDataAccess('CLAIM', 'EMPLOYEE_CLAIMS_VIEWED'), getMyClaims);
router.get('/:claimId', authenticate, auditDataAccess('CLAIM', 'CLAIM_DETAILS_VIEWED'), getClaimDetails);

export default router;

