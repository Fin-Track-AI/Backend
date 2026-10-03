import express from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth.middleware.js';
import { auditDataAccess } from '../middlewares/audit.middleware.js';
import { uploadStatement, confirmStatement } from '../controllers/statement.controller.js';

const router = express.Router();

// In-memory buffer size restricted to 10MB to protect against process OOM exhaustion (SEC-012)
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/octet-stream' ||
      (file.originalname && file.originalname.toLowerCase().endsWith('.pdf'));

    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted for bank statement import'));
    }
  },
});

/**
 * POST /api/statement/upload
 * Upload a PDF bank statement for AI parsing preview.
 * Returns a list of extracted transactions for user review.
 */
router.post(
  '/upload',
  authenticate,
  auditDataAccess('STATEMENT', 'STATEMENT_UPLOAD_PARSED'),
  pdfUpload.single('statement'),
  uploadStatement
);

/**
 * POST /api/statement/confirm
 * Confirm and bulk-insert the reviewed transaction list.
 */
router.post(
  '/confirm',
  authenticate,
  auditDataAccess('STATEMENT', 'STATEMENT_TRANSACTIONS_CONFIRMED'),
  confirmStatement
);

export default router;
