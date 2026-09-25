/**
 * FinTrack AI - Data Masking & Cloud DLP Test Suite
 * Covers SCRUM-146, SCRUM-147, SCRUM-148, and SCRUM-149
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { dlpService, cloudDlpConfig } from '../src/services/dlp.service.js';
import { nonPrivilegedMaskingMiddleware } from '../src/middlewares/masking.middleware.js';
import { logger } from '../src/utils/logger.js';

describe('SCRUM-146: Data Masking (Cloud DLP)', () => {
  describe('SCRUM-147: Cloud DLP Configuration & UPI/Account Number Masking', () => {
    test('conforms to Google Cloud DLP v2 Inspect & Deidentify templates', () => {
      expect(cloudDlpConfig.projectId).toBeDefined();
      expect(cloudDlpConfig.inspectTemplate.name).toContain('projects/');
      expect(cloudDlpConfig.inspectTemplate.inspectConfig.infoTypes).toEqual(
        expect.arrayContaining([
          { name: 'CUSTOM_UPI_ID' },
          { name: 'CUSTOM_BANK_ACCOUNT' },
          { name: 'PHONE_NUMBER' },
          { name: 'INDIA_PAN' },
        ])
      );
      expect(cloudDlpConfig.deidentifyTemplate.deidentifyConfig.infoTypeTransformations).toBeDefined();
    });

    test('masks standard alphanumeric UPI IDs', () => {
      const masked = dlpService.maskUpiId('rohit.sharma@okhdfcbank');
      expect(masked).toBe('ro****@okhdfcbank');
    });

    test('masks phone-number-based UPI IDs', () => {
      const masked = dlpService.maskUpiId('9876543210@paytm');
      expect(masked).toBe('98******10@paytm');
    });

    test('masks short handle UPI IDs', () => {
      const masked = dlpService.maskUpiId('ab@upi');
      expect(masked).toBe('a*@upi');
    });

    test('masks 12-digit bank account number preserving only last 4 digits', () => {
      const masked = dlpService.maskBankAccount('123456789012');
      expect(masked).toBe('********9012');
    });

    test('masks 16-digit bank account number preserving only last 4 digits', () => {
      const masked = dlpService.maskBankAccount('1122334455667788');
      expect(masked).toBe('************7788');
    });

    test('handles bank account numbers with hyphens and spaces', () => {
      const masked = dlpService.maskBankAccount('1234-5678-9012');
      expect(masked).toBe('********9012');
    });
  });

  describe('SCRUM-148: Logger Scrubbing & Non-Privileged View Masking', () => {
    let logSpy;

    beforeEach(() => {
      logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    test('scrubs raw UPI ID and account numbers from logger output', () => {
      logger.info('Payment received for VPA user.name@okaxis into a/c 987654321012', {
        beneficiaryAccount: '987654321012',
        upiId: 'finance.corp@icici',
      });

      expect(logSpy).toHaveBeenCalled();
      const loggedCall = logSpy.mock.calls[0];
      const loggedMessage = loggedCall[0];
      const loggedPayload = loggedCall[1];

      // Text message should be sanitized
      expect(loggedMessage).not.toContain('user.name@okaxis');
      expect(loggedMessage).toContain('us****@okaxis');
      expect(loggedMessage).not.toContain('987654321012');
      expect(loggedMessage).toContain('********1012');

      // Object payload should be sanitized
      expect(loggedPayload.beneficiaryAccount).toBe('********1012');
      expect(loggedPayload.upiId).toBe('fi****@icici');
    });

    test('applies masking header and sanitizes non-privileged JSON responses', async () => {
      const express = (await import('express')).default;
      const testApp = express();
      testApp.use(express.json());
      testApp.use((req, res, next) => {
        req.user = { id: 'usr_mock', role: 'USER' };
        next();
      });
      testApp.use(nonPrivilegedMaskingMiddleware);

      testApp.get('/test-dlp-view', (req, res) => {
        res.json({
          status: 'success',
          profile: {
            name: 'Ritesh Jadhav',
            bankAccount: '123456789012',
            upiId: 'ritesh.j@okaxis',
            phone: '9876543210',
          },
        });
      });

      const res = await request(testApp).get('/test-dlp-view');

      expect(res.status).toBe(200);
      expect(res.headers['x-dlp-masking']).toBe('applied');
      expect(res.body.profile.bankAccount).toBe('********9012');
      expect(res.body.profile.upiId).toBe('ri****@okaxis');
      expect(res.body.profile.phone).toBe('98*****210');
      expect(res.body.profile.name).toBe('Ritesh Jadhav');
    });

    test('allows privileged role to bypass masking for audit and oversight', () => {
      const privilegedData = {
        bankAccount: '123456789012',
        upiId: 'finance.admin@icici',
      };

      const result = dlpService.maskObjectForNonPrivileged(privilegedData, {
        role: 'SECURITY_ADMIN',
      });

      expect(result.bankAccount).toBe('123456789012');
      expect(result.upiId).toBe('finance.admin@icici');
    });
  });

  describe('SCRUM-149: Verification on Specific Sensitive Field Types', () => {
    test('masks Indian phone numbers in +91 and 10-digit formats', () => {
      const masked1 = dlpService.maskPhoneNumber('9876543210');
      expect(masked1).toBe('98*****210');

      const masked2 = dlpService.maskPhoneNumber('+919876543210');
      expect(masked2).toBe('+91 98*****210');

      const masked3 = dlpService.maskPhoneNumber('+91 9876543210');
      expect(masked3).toBe('+91 98*****210');
    });

    test('masks Indian Permanent Account Numbers (PAN)', () => {
      const masked = dlpService.maskPan('ABCDE1234F');
      expect(masked).toBe('AB****34F');
    });

    test('recursively scrubs deep nested objects and arrays containing sensitive fields', () => {
      const sensitiveRecord = {
        company: 'FinTrack Corp',
        employees: [
          {
            empId: 'EMP001',
            accountNumber: '998877665544',
            upiId: 'emp1@hdfcbank',
            taxId: 'ABCDE5678G',
          },
          {
            empId: 'EMP002',
            accountNumber: '556677889900',
            upiId: 'emp2@oksbi',
            taxId: 'XYZPQ1234K',
          },
        ],
        auditNotes: 'Transfer details sent to a/c 998877665544 and VPA emp1@hdfcbank',
      };

      const maskedRecord = dlpService.maskSensitiveData(sensitiveRecord);

      expect(maskedRecord.employees[0].accountNumber).toBe('********5544');
      expect(maskedRecord.employees[0].upiId).toBe('em****@hdfcbank');
      expect(maskedRecord.employees[0].taxId).toBe('AB****78G');

      expect(maskedRecord.employees[1].accountNumber).toBe('********9900');
      expect(maskedRecord.employees[1].upiId).toBe('em****@oksbi');
      expect(maskedRecord.employees[1].taxId).toBe('XY****34K');

      expect(maskedRecord.auditNotes).toContain('********5544');
      expect(maskedRecord.auditNotes).toContain('em****@hdfcbank');
    });

    test('preserves non-sensitive system IDs, hashes, and timestamps', () => {
      const recordWithMetadata = {
        _id: '64f8a1b2c3d4e5f6a7b8c9d0',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        timestamp: 1727287200000,
        upiId: 'admin@okaxis',
      };

      const result = dlpService.maskSensitiveData(recordWithMetadata);

      expect(result._id).toBe('64f8a1b2c3d4e5f6a7b8c9d0');
      expect(result.hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(result.timestamp).toBe(1727287200000);
      expect(result.upiId).toBe('ad****@okaxis');
    });

    test('preserves Date objects and date strings without converting to indexed maps', () => {
      const tx = {
        title: 'Greenmart Grocers',
        category: 'Groceries',
        date: new Date('2026-09-26T12:00:00.000Z'),
        createdAt: '2026-09-26T12:00:00.000Z',
        amount: 1850,
      };

      const result = dlpService.maskSensitiveData(tx);
      expect(typeof result.date).toBe('string');
      expect(result.date).toBe('2026-09-26T12:00:00.000Z');
      expect(Array.isArray(result.date)).toBe(false);
    });
  });
});
