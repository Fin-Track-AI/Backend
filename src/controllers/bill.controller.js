import { billService } from '../services/bill.service.js';
import { storageService } from '../services/storage.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const uploadBill = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
    if (!req.file) {
      return ApiResponse.error(res, 'No bill photo uploaded. Please attach a bill image file.', 400);
    }

    const { merchantName, totalAmount } = req.body;
    const billRecord = await billService.uploadBill(userId, req.file, {
      merchantName,
      totalAmount,
    });

    return ApiResponse.success(res, 'Bill photo uploaded and linked successfully', billRecord, 201);
  } catch (error) {
    next(error);
  }
};

export const getBillMetadata = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const { billId } = req.params;

    const billRecord = await billService.getBillById(billId, userId);
    return ApiResponse.success(res, 'Bill details retrieved successfully', billRecord);
  } catch (error) {
    next(error);
  }
};

export const getBillImage = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const { billId } = req.params;

    // Strict ownership verification
    const billRecord = await billService.getBillById(billId, userId);

    const stream = storageService.getFileStream(billRecord.filePath);

    res.setHeader('Content-Type', billRecord.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Content-Disposition', `inline; filename="${billRecord.originalName}"`);

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const listUserBills = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const bills = await billService.getUserBills(userId);
    return ApiResponse.success(res, 'User bills retrieved successfully', { bills });
  } catch (error) {
    next(error);
  }
};
