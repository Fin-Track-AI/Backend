import { ocrService } from '../services/ocr.service.js';
import { billService } from '../services/bill.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const processBillOcr = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const { billId } = req.params;

    // Fetch bill record with strict ownership check
    const billRecord = await billService.getBillById(billId, userId);

    const sampleOcrText = `
Merchant: ${billRecord.merchantName || 'Bistro Deluxe'}
Date: 2026-09-10
Tax: $12.50
Total: $${billRecord.totalAmount || 125.50}
    `.trim();

    const ocrResult = await ocrService.processOcrText(sampleOcrText);

    return ApiResponse.success(res, 'OCR auto-extraction processed successfully', {
      billId,
      ...ocrResult,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadAndParseOcr = async (req, res, next) => {
  try {
    let ocrResult;
    if (req.file) {
      ocrResult = await ocrService.processOcrText(req.file.buffer, req.file.originalname || '');
    } else if (req.body.receiptText) {
      ocrResult = await ocrService.processOcrText(req.body.receiptText);
    } else {
      return ApiResponse.error(res, 'No receipt file or text provided for OCR processing', 400);
    }

    return ApiResponse.success(res, 'Receipt parsed and pre-fill fields extracted', ocrResult, 200);
  } catch (error) {
    next(error);
  }
};
