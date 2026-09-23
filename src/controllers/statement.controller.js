import { statementService } from '../services/statement.service.js';
import { TransactionModel } from '../models/transaction.model.js';
import { UserModel } from '../models/user.model.js';
import { UserService } from '../services/user.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/statement/upload
 * Accepts a PDF bank statement, parses it with Gemini AI,
 * and returns a preview of extracted transactions for user review.
 */
export const uploadStatement = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!req.file) {
      return ApiResponse.error(res, 'No PDF file uploaded', 400);
    }

    const { mimetype, originalname, size } = req.file;
    const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

    if (size > MAX_SIZE) {
      return ApiResponse.error(res, 'File too large. Maximum allowed size is 50 MB.', 400);
    }

    // Accept PDF files (some clients may send octet-stream)
    const looksLikePdf =
      mimetype === 'application/pdf' ||
      mimetype === 'application/octet-stream' ||
      (originalname && originalname.toLowerCase().endsWith('.pdf'));

    if (!looksLikePdf) {
      return ApiResponse.error(res, 'Only PDF bank statements are supported at this time.', 400);
    }

    console.log(`[Statement] Processing PDF: ${originalname} (${(size / 1024).toFixed(1)} KB) for user ${userId}`);

    // Parse the PDF — progress is logged server-side
    let lastProgress = 0;
    const result = await statementService.parsePdfStatement(req.file.buffer, (pct) => {
      if (pct > lastProgress + 10) {
        console.log(`[Statement] Progress: ${pct}%`);
        lastProgress = pct;
      }
    });

    return ApiResponse.success(res, 'Statement parsed successfully', {
      transactions: result.transactions,
      numPages: result.numPages,
      totalFound: result.totalFound,
      filename: originalname,
    });
  } catch (error) {
    console.error('[Statement Upload Error]:', error.message);

    if (error.message.includes('Could not extract readable text')) {
      return ApiResponse.error(res, error.message, 422);
    }
    if (error.message.includes('GEMINI_API_KEY')) {
      return ApiResponse.error(res, 'AI service is not configured. Please contact support.', 503);
    }

    next(error);
  }
};

/**
 * POST /api/statement/confirm
 * Bulk-inserts the user-confirmed transaction list into the database.
 * Tags all records with a shared importBatchId so they can be traced back.
 */
export const confirmStatement = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { transactions } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return ApiResponse.error(res, 'No transactions provided', 400);
    }

    if (transactions.length > 2000) {
      return ApiResponse.error(res, 'Too many transactions in a single import (max 2000)', 400);
    }

    const importBatchId = uuidv4();

    const docs = transactions.map((tx) => ({
      userId,
      title: String(tx.title || 'Bank Transaction').trim().slice(0, 100),
      amount: Math.abs(Number(tx.amount) || 0),
      type: tx.type === 'income' ? 'income' : 'expense',
      category: tx.category || 'Others',
      paidVia: tx.paidVia || 'Others',
      isReimbursable: Boolean(tx.isReimbursable),
      note: String(tx.note || tx.description || '').trim().slice(0, 500),
      date: tx.date ? new Date(tx.date) : new Date(),
      source: 'statement',
      importBatchId,
      createdAt: new Date(),
    }));

    const inserted = await TransactionModel.insertMany(docs, { ordered: false });

    console.log(`[Statement] Imported ${inserted.length} transactions (batch: ${importBatchId}) for user ${userId}`);

    // Detect and override user profile data from bank statement
    let detectedSalary = 0;
    let detectedRent = 0;

    const salaryTxns = transactions.filter(
      (tx) => tx.category === 'Salary' || (tx.type === 'income' && /salary/i.test(String(tx.title || '') + ' ' + String(tx.note || '')))
    );
    if (salaryTxns.length > 0) {
      salaryTxns.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      detectedSalary = Number(salaryTxns[0].amount) || 0;
    }

    const rentTxns = transactions.filter(
      (tx) => tx.category === 'Rent' || /rent/i.test(String(tx.title || '') + ' ' + String(tx.note || ''))
    );
    if (rentTxns.length > 0) {
      rentTxns.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      detectedRent = Number(rentTxns[0].amount) || 0;
    }

    let updatedUser = null;
    if (userId && (detectedSalary > 0 || detectedRent > 0)) {
      const updateData = {};
      if (detectedSalary > 0) {
        updateData.salary = detectedSalary;
      }
      if (detectedRent > 0) {
        updateData.rent = detectedRent;
      }
      updateData.isSetupComplete = true;

      const user = await UserModel.findByIdAndUpdate(userId, updateData, { returnDocument: 'after' });
      if (user) {
        updatedUser = UserService.formatUserPayload(user);
      }
      console.log(`[Statement] Overrode profile for user ${userId} from bank statement:`, updateData);
    }

    return ApiResponse.success(res, `Successfully imported ${inserted.length} transactions`, {
      imported: inserted.length,
      importBatchId,
      detectedSalary,
      detectedRent,
      user: updatedUser,
    }, 201);
  } catch (error) {
    console.error('[Statement Confirm Error]:', error.message);
    next(error);
  }
};
