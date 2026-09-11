import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'path';
import app from '../src/app.js';
import { consentService } from '../src/services/consent.service.js';
import { ocrService } from '../src/services/ocr.service.js';

const AUTH_HEADER = 'Bearer user_a_token';
const FIXTURES_DIR = path.join(process.cwd(), 'test', 'fixtures');

describe('OCR Auto-Extraction Tests (BR-10 & SOW Section 6)', () => {
  beforeEach(async () => {
    consentService._clearStore();
    // Grant required consents
    await consentService.updateConsents('user_a', {
      aiUsageConsent: true,
      billStorageConsent: true,
    });
  });

  describe('Format 1: Printed Retail Receipt (High Confidence)', () => {
    it('should extract structured fields: merchant, amount, date, tax with high confidence', async () => {
      const printedPath = path.join(FIXTURES_DIR, 'receipt_printed.png');

      const response = await request(app)
        .post('/api/v1/ocr/upload-and-parse')
        .set('Authorization', AUTH_HEADER)
        .attach('billImage', printedPath);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, true);

      const data = response.body.data.extractedData;
      assert.strictEqual(data.merchant, 'Bistro Deluxe');
      assert.strictEqual(data.amount, 125.50);
      assert.strictEqual(data.date, '2026-09-10');
      assert.strictEqual(data.tax, 12.50);
      assert.strictEqual(data.isLowConfidence, false);
      assert.strictEqual(data.requiresManualReview, false);
      assert.ok(data.confidence >= 0.80);
    });
  });

  describe('Format 2: Digital Invoice (High Confidence)', () => {
    it('should extract structured corporate invoice fields cleanly', async () => {
      const invoicePath = path.join(FIXTURES_DIR, 'invoice_digital.png');

      const response = await request(app)
        .post('/api/v1/ocr/upload-and-parse')
        .set('Authorization', AUTH_HEADER)
        .attach('billImage', invoicePath);

      assert.strictEqual(response.status, 200);

      const data = response.body.data.extractedData;
      assert.strictEqual(data.merchant, 'Tech Store Services Inc.');
      assert.strictEqual(data.amount, 899.00);
      assert.strictEqual(data.date, '2026-09-11');
      assert.strictEqual(data.tax, 49.00);
      assert.strictEqual(data.isLowConfidence, false);
    });
  });

  describe('Format 3: Handwritten / Blurry Receipt (Graceful Fallback)', () => {
    it('should trigger low confidence and set requiresManualReview flag (Never silently wrong)', async () => {
      const handwrittenPath = path.join(FIXTURES_DIR, 'receipt_handwritten.png');

      const response = await request(app)
        .post('/api/v1/ocr/upload-and-parse')
        .set('Authorization', AUTH_HEADER)
        .attach('billImage', handwrittenPath);

      assert.strictEqual(response.status, 200);

      const data = response.body.data.extractedData;
      assert.strictEqual(data.isLowConfidence, true);
      assert.strictEqual(data.requiresManualReview, true);
      assert.ok(data.confidence < 0.60);
    });
  });

  describe('Direct Service OCR Unit Tests', () => {
    it('should correctly calculate scores and parse structured values', async () => {
      const text = `
Store: Starbucks Coffee
Date: 2026-09-08
Tax: $1.20
Total: $14.50
      `.trim();

      const result = await ocrService.processOcrText(text);

      assert.strictEqual(result.extractedData.merchant, 'Starbucks Coffee');
      assert.strictEqual(result.extractedData.amount, 14.50);
      assert.strictEqual(result.extractedData.date, '2026-09-08');
      assert.strictEqual(result.extractedData.tax, 1.20);
      assert.strictEqual(result.extractedData.isLowConfidence, false);
    });
  });

  describe('Consent Revocation Protection', () => {
    it('should BLOCK OCR processing if aiUsageConsent is revoked', async () => {
      await consentService.updateConsents('user_a', { aiUsageConsent: false });

      const printedPath = path.join(FIXTURES_DIR, 'receipt_printed.png');

      const response = await request(app)
        .post('/api/v1/ocr/upload-and-parse')
        .set('Authorization', AUTH_HEADER)
        .attach('billImage', printedPath);

      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.body.success, false);
      assert.match(response.body.message, /aiUsageConsent/i);
    });
  });
});
