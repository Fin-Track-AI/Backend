import { storageService } from './storage.service.js';

/**
 * In-memory bill metadata store.
 * Key: billId, Value: Bill Object
 */
const billStore = new Map();

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

    const billRecord = {
      id: billId,
      userId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageKey: storageResult.storageKey,
      filePath: storageResult.filePath,
      merchantName: extraData.merchantName || 'Unspecified Merchant',
      totalAmount: extraData.totalAmount ? Number(extraData.totalAmount) : null,
      uploadedAt: new Date().toISOString(),
    };

    billStore.set(billId, billRecord);
    return billRecord;
  },

  /**
   * Fetch bill metadata with strict ownership validation (Tenant Isolation).
   */
  getBillById: async (billId, requestingUserId) => {
    const bill = billStore.get(billId);
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
    const userBills = [];
    for (const bill of billStore.values()) {
      if (bill.userId === userId) {
        userBills.push(bill);
      }
    }
    return userBills;
  },

  /**
   * Helper to clear store for testing
   */
  _clearStore: () => {
    billStore.clear();
  },
};
