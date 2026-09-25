import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../src/app.js';
import { config } from '../src/config/env.js';
import { getMongoTlsOptions } from '../src/config/db.js';
import {
  encryptBuffer,
  decryptBuffer,
  isEncryptedBuffer,
  ENCRYPTION_MAGIC_HEADER,
} from '../src/utils/encryption.js';
import { storageService } from '../src/services/storage.service.js';
import { ClaimModel } from '../src/models/claim.model.js';
import { BillModel } from '../src/models/bill.model.js';
import { HSTS_HEADER_VALUE } from '../src/middlewares/tlsGuard.middleware.js';

describe('SCRUM-150: Encryption in Transit & At Rest (TLS 1.2+ / AES-256)', () => {
  // -------------------------------------------------------------
  // SCRUM-151: In-Transit Security & TLS 1.2+ Enforcement
  // -------------------------------------------------------------
  describe('SCRUM-151: Enforce TLS 1.2+ & Strict-Transport-Security (HSTS)', () => {
    test('1. Every API response includes Strict-Transport-Security header with 1-year max-age and preload', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);

      const hsts = res.headers['strict-transport-security'];
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
      expect(hsts).toContain('preload');
      expect(hsts).toBe(HSTS_HEADER_VALUE);
    });

    test('2. In production mode, insecure HTTP requests (x-forwarded-proto: http) are blocked with HTTP 403', async () => {
      const originalEnv = config.nodeEnv;
      config.nodeEnv = 'production';

      try {
        const res = await request(app)
          .get('/api/v1/health')
          .set('x-forwarded-proto', 'http');

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('HTTPS with TLS 1.2+ is strictly required');
        expect(res.body.errors.complianceStatus).toBe('TLS_ENFORCEMENT_REQUIRED');
        expect(res.body.errors.minTlsVersion).toBe('TLSv1.2');
      } finally {
        config.nodeEnv = originalEnv;
      }
    });

    test('3. Database connection options enforce TLS 1.2+ for remote MongoDB Atlas connections', () => {
      const tlsOptions = getMongoTlsOptions();
      expect(tlsOptions.tls).toBe(true);
      expect(tlsOptions.minTLSVersion).toBe('TLSv1.2');
    });
  });

  // -------------------------------------------------------------
  // SCRUM-152: AES-256-GCM Encryption at Rest for Storage
  // -------------------------------------------------------------
  describe('SCRUM-152: AES-256-GCM authenticated encryption at rest for files & storage', () => {
    test('4. Files written to disk via storageService.saveFile are encrypted with AES-256-GCM envelope', async () => {
      const sampleReceiptData = Buffer.from(
        'CONFIDENTIAL RECEIPT: Hotel Blue Tokai Coffee - Total ₹480 - GSTIN 27AABCT3518Q1Z9',
        'utf8'
      );

      const saved = await storageService.saveFile(
        'user_crypto_test',
        'bill_enc_001',
        'coffee_receipt.jpg',
        sampleReceiptData
      );

      expect(saved.isEncryptedAtRest).toBe(true);
      expect(saved.encryptionAlgorithm).toBe('AES-256-GCM');
      expect(fs.existsSync(saved.filePath)).toBe(true);

      // Read raw file directly from disk
      const diskBytes = fs.readFileSync(saved.filePath);

      // 1. Must start with 8-byte magic header "FIN_ENC1"
      expect(isEncryptedBuffer(diskBytes)).toBe(true);
      expect(diskBytes.subarray(0, 8).equals(ENCRYPTION_MAGIC_HEADER)).toBe(true);

      // 2. Must NOT contain the original plaintext string anywhere on disk
      expect(diskBytes.toString('utf8')).not.toContain('CONFIDENTIAL RECEIPT');
      expect(diskBytes.toString('utf8')).not.toContain('Blue Tokai');

      // Cleanup
      storageService.deleteFile(saved.filePath);
    });

    test('5. storageService transparently decrypts and streams the exact original bytes to authenticated readers', async () => {
      const originalContent = 'GST TAX INVOICE #INV-8899: Flight to Bengaluru ₹6,450.00';
      const plainBuffer = Buffer.from(originalContent, 'utf8');

      const saved = await storageService.saveFile(
        'user_crypto_test_2',
        'bill_enc_002',
        'flight_ticket.pdf',
        plainBuffer
      );

      // Decrypt via getFileBuffer
      const decryptedBuffer = storageService.getFileBuffer(saved.filePath);
      expect(decryptedBuffer.toString('utf8')).toBe(originalContent);

      // Decrypt via getFileStream
      const stream = storageService.getFileStream(saved.filePath);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const streamedContent = Buffer.concat(chunks).toString('utf8');
      expect(streamedContent).toBe(originalContent);

      storageService.deleteFile(saved.filePath);
    });

    test('6. Cryptographic Authenticity: Tampering with ciphertext or authentication tag fails decryption immediately', () => {
      const secretPayload = Buffer.from('Corporate Credit Card Statement Line Item: $15,000', 'utf8');
      const encrypted = encryptBuffer(secretPayload);

      expect(isEncryptedBuffer(encrypted)).toBe(true);

      // Tamper with one byte in the ciphertext payload
      const tampered = Buffer.from(encrypted);
      const lastIndex = tampered.length - 1;
      tampered[lastIndex] = tampered[lastIndex] ^ 0xff; // flip bits

      // Decrypting tampered buffer must fail with authentication error
      expect(() => decryptBuffer(tampered)).toThrow();
    });

    test('7. Backward compatibility: Gracefully handles legacy unencrypted files without crashing', () => {
      const legacyPlaintext = Buffer.from('Legacy unencrypted receipt data', 'utf8');
      expect(isEncryptedBuffer(legacyPlaintext)).toBe(false);

      const result = decryptBuffer(legacyPlaintext);
      expect(result.toString('utf8')).toBe('Legacy unencrypted receipt data');
    });

    test('8. End-to-end receipt image retrieval (/api/v1/claims/:claimId/receipt-image) streams decrypted content', async () => {
      const sampleText = 'Decrypted Image Content: Auto-Rickshaw fare ₹120';
      const saved = await storageService.saveFile(
        'user_crypto_claim',
        'bill_claim_enc_1',
        'receipt.jpg',
        Buffer.from(sampleText, 'utf8')
      );

      await BillModel.create({
        billId: 'bill_claim_enc_1',
        userId: 'user_crypto_claim',
        originalName: 'receipt.jpg',
        filePath: saved.filePath,
        storageKey: saved.storageKey,
      });

      const claim = await ClaimModel.create({
        claimId: 'claim_e2e_enc_1',
        userId: 'user_crypto_claim',
        employerId: 'emp_1',
        employerName: 'Acme Corp',
        title: 'Auto Fare',
        amount: 120,
        category: 'Travel',
        project: 'Ops',
        costCenter: 'CC-101',
        billId: 'bill_claim_enc_1',
        billStorageKey: saved.storageKey,
      });

      const res = await request(app).get(`/api/v1/claims/${claim.claimId}/receipt-image`);
      expect(res.status).toBe(200);
      const receivedContent = Buffer.isBuffer(res.body) ? res.body.toString('utf8') : (res.text || '');
      expect(receivedContent).toBe(sampleText);

      storageService.deleteFile(saved.filePath);
    });
  });
});
