import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import app from '../src/app.js';
import { billService } from '../src/services/bill.service.js';
import { consentService } from '../src/services/consent.service.js';

const USER_A_AUTH = 'Bearer user_a_token';
const USER_B_AUTH = 'Bearer user_b_token';

const FIXTURES_DIR = path.join(process.cwd(), 'test', 'fixtures');

describe('BR-10: Bill Photo Capture & Secure Storage Tests', () => {
  beforeEach(async () => {
    billService._clearStore();
    consentService._clearStore();

    // Enable billStorageConsent for testing user
    await consentService.updateConsents('user_123', { billStorageConsent: true });
    await consentService.updateConsents('user_a', { billStorageConsent: true });
    await consentService.updateConsents('user_b', { billStorageConsent: true });
  });

  describe('Validation (File Type & Size)', () => {
    it('should REJECT non-image uploads (e.g. PDF file)', async () => {
      const pdfPath = path.join(FIXTURES_DIR, 'invalid_document.pdf');

      const response = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', pdfPath);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.success, false);
      assert.match(response.body.message, /Only image files/i);
    });

    it('should REJECT uploads when no file is attached', async () => {
      const response = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .send({ merchantName: 'Empty Upload' });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.success, false);
      assert.match(response.body.message, /No bill photo uploaded/i);
    });
  });

  describe('Upload & Persistence with 3 Sample Receipts', () => {
    it('should successfully upload and persist sample 1: Restaurant Bill (JPG)', async () => {
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');

      const response = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .field('merchantName', 'Bistro Deluxe')
        .field('totalAmount', '125.50')
        .attach('billImage', imgPath);

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.data.merchantName, 'Bistro Deluxe');
      assert.strictEqual(response.body.data.totalAmount, 125.50);
      assert.ok(response.body.data.id);
      assert.ok(response.body.data.storageKey);
    });

    it('should successfully upload and persist sample 2: Grocery Receipt (PNG)', async () => {
      const imgPath = path.join(FIXTURES_DIR, 'receipt_grocery.png');

      const response = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .field('merchantName', 'SuperMart')
        .field('totalAmount', '48.90')
        .attach('billImage', imgPath);

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.data.merchantName, 'SuperMart');
      assert.strictEqual(response.body.data.mimeType, 'image/png');
    });

    it('should successfully upload and persist sample 3: Electronics Invoice (JPG)', async () => {
      const imgPath = path.join(FIXTURES_DIR, 'receipt_electronics.jpg');

      const response = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .field('merchantName', 'Tech Store')
        .field('totalAmount', '899.00')
        .attach('billImage', imgPath);

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.data.merchantName, 'Tech Store');
    });
  });

  describe('Secure Image Retrieval & Tenant Isolation', () => {
    it('should allow the authenticated owner (User A) to retrieve their bill image stream', async () => {
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');

      // Upload by User A
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      const billId = uploadRes.body.data.id;

      // User A retrieves image
      const imageRes = await request(app)
        .get(`/api/v1/bills/${billId}/image`)
        .set('Authorization', USER_A_AUTH);

      assert.strictEqual(imageRes.status, 200);
      assert.match(imageRes.headers['content-type'], /image\/jpeg/);
      assert.match(imageRes.headers['cache-control'], /private/);
      assert.ok(imageRes.body.length > 0);
    });

    it('should BLOCK User B from retrieving User A bill image (Strict Tenant Isolation)', async () => {
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');

      // Upload by User A
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      const billId = uploadRes.body.data.id;

      // User B attempts to retrieve User A's image
      const unauthorizedRes = await request(app)
        .get(`/api/v1/bills/${billId}/image`)
        .set('Authorization', USER_B_AUTH);

      assert.strictEqual(unauthorizedRes.status, 403);
      assert.strictEqual(unauthorizedRes.body.success, false);
      assert.match(unauthorizedRes.body.message, /Access denied: You do not own this bill/i);
    });
  });

  describe('Consent Revocation Enforcement', () => {
    it('should BLOCK bill endpoints when billStorageConsent is revoked', async () => {
      // Revoke consent for user_a
      await consentService.updateConsents('user_a', { billStorageConsent: false });

      const response = await request(app)
        .get('/api/v1/bills')
        .set('Authorization', USER_A_AUTH);

      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.body.success, false);
      assert.match(response.body.message, /Consent for 'billStorageConsent' is revoked/i);
    });
  });
});
