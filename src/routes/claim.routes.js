import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth.middleware.js';
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

// Enforce authentication across all claim routes
router.use(authenticate);

// 1. Employee Mobile Routes (Authenticated employees)
router.post('/', submitClaim);
router.get('/my-claims', auditDataAccess('CLAIM', 'EMPLOYEE_CLAIMS_VIEWED'), getMyClaims);
router.get('/:claimId/receipt-image', auditDataAccess('RECEIPT', 'RECEIPT_IMAGE_ACCESSED'), getClaimReceiptImage);
router.get('/:claimId', auditDataAccess('CLAIM', 'CLAIM_DETAILS_VIEWED'), getClaimDetails);

// 2. Employer & Finance Admin Routes (Restricted by Role-Based Access Control)
router.get(
  '/',
  requireRole(['EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN', 'SYSTEM']),
  auditDataAccess('CLAIM', 'CLAIM_LIST_VIEWED'),
  getAllClaims
);

router.get(
  '/employer/all',
  requireRole(['EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN', 'SYSTEM']),
  auditDataAccess('CLAIM', 'EMPLOYER_CLAIMS_VIEWED'),
  getEmployerClaims
);

router.patch(
  '/:claimId/status',
  requireRole(['EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN', 'SYSTEM']),
  updateClaimStatus
);

router.post(
  '/:claimId/approve',
  requireRole(['EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN', 'SYSTEM']),
  (req, res, next) => {
    req.body.status = 'Approved';
    return updateClaimStatus(req, res, next);
  }
);

router.post(
  '/:claimId/reject',
  requireRole(['EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN', 'SYSTEM']),
  (req, res, next) => {
    req.body.status = 'Rejected';
    return updateClaimStatus(req, res, next);
  }
);

router.delete(
  '/clear-all',
  requireRole(['EMPLOYER_ADMIN', 'SECURITY_ADMIN', 'SYSTEM']),
  clearAllClaims
);

router.delete(
  '/:claimId',
  requireRole(['EMPLOYER_ADMIN', 'SECURITY_ADMIN', 'SYSTEM']),
  deleteClaim
);

export default router;
