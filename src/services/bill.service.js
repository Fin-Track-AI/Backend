import { BillModel } from '../models/bill.model.js';
import { storageService } from './storage.service.js';

export const billService = {
  /**
   * Save bill photo and metadata.
   */
  uploadBill: async (userId, file, extraData = {}) => {
    if (!file) {
      const error = new Error('No bill photo provided');
      error.statusCode = 400;
      throw error;
    }

    const billId = `bill_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const storageResult = await storageService.saveFile(
      userId,
      billId,
      file.originalname || 'receipt.jpg',
      file.buffer
    );

    const billRecord = await BillModel.create({
      billId,
      userId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageKey: storageResult.storageKey,
      filePath: storageResult.filePath,
      merchantName: extraData.merchantName || 'Unspecified Merchant',
      totalAmount: extraData.totalAmount ? Number(extraData.totalAmount) : null,
      uploadedAt: new Date(),
    });

    return billRecord.toObject();
  },

  /**
   * Fetch bill metadata with strict ownership validation (Tenant Isolation).
   */
  getBillById: async (billId, requestingUserId) => {
    const bill = await BillModel.findOne({ billId }).lean();
    if (!bill) {
      const error = new Error(`Bill record '${billId}' not found.`);
      error.statusCode = 404;
      throw error;
    }

    // Strict Tenant Isolation Check
    if (bill.userId !== requestingUserId) {
      const error = new Error('Access denied: You do not own this bill.');
      error.statusCode = 403;
      error.code = 'TENANT_ISOLATION_VIOLATION';
      throw error;
    }

    return bill;
  },

  /**
   * Fetch list of uploaded bills for authenticated user.
   */
  getUserBills: async (userId) => {
    return await BillModel.find({ userId }).sort({ uploadedAt: -1 }).lean();
  },

  /**
   * Helper to clear store for testing.
   */
  _clearStore: async () => {
    await BillModel.deleteMany({ userId: 'user_123' });
  },
};

