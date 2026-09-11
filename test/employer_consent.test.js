import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { employerService } from '../src/services/employer.service.js';
import { consentService } from '../src/services/consent.service.js';

const MOCK_AUTH_HEADER = 'Bearer mock_token_123';

describe('Employer Linking & Consent Management Tests', () => {
  beforeEach(() => {
    employerService._clearStore();
    consentService._clearStore();
  });

  describe('BR-02: Employer Linking', () => {
    it('should link an employer successfully when none is currently linked', async () => {
      const response = await request(app)
        .post('/api/v1/employer/link')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({
          employerName: 'Acme Corp',
          corporateEmail: 'john@acme.corp',
          employeeId: 'EMP-99',
        });

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.data.employerName, 'Acme Corp');
      assert.strictEqual(response.body.data.corporateEmail, 'john@acme.corp');
      assert.strictEqual(response.body.data.verificationStatus, 'VERIFIED');
    });

    it('should retrieve currently linked employer', async () => {
      await request(app)
        .post('/api/v1/employer/link')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({ employerName: 'TechSolutions Inc' });

      const response = await request(app)
        .get('/api/v1/employer')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.data.linked, true);
      assert.strictEqual(response.body.data.employer.employerName, 'TechSolutions Inc');
    });

    it('should REJECT linking a second employer if one is already linked (Single Employer Rule)', async () => {
      // First link
      const firstLink = await request(app)
        .post('/api/v1/employer/link')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({ employerName: 'First Employer' });

      assert.strictEqual(firstLink.status, 201);

      // Second link attempt
      const secondLink = await request(app)
        .post('/api/v1/employer/link')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({ employerName: 'Second Employer' });

      assert.strictEqual(secondLink.status, 400);
      assert.strictEqual(secondLink.body.success, false);
      assert.match(secondLink.body.message, /already has a linked employer/i);
    });

    it('should allow unlinking an employer and then linking a new one', async () => {
      // Link
      await request(app)
        .post('/api/v1/employer/link')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({ employerName: 'Old Employer' });

      // Unlink
      const unlinkRes = await request(app)
        .delete('/api/v1/employer/unlink')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(unlinkRes.status, 200);
      assert.strictEqual(unlinkRes.body.success, true);

      // Verify empty state
      const getRes = await request(app)
        .get('/api/v1/employer')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(getRes.body.data.linked, false);

      // Relink new employer
      const relinkRes = await request(app)
        .post('/api/v1/employer/link')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({ employerName: 'New Employer' });

      assert.strictEqual(relinkRes.status, 201);
      assert.strictEqual(relinkRes.body.data.employerName, 'New Employer');
    });
  });

  describe('BR-03: Consent Management & Revocation Enforcement', () => {
    it('should return default consents (all false) for a new user', async () => {
      const response = await request(app)
        .get('/api/v1/consent')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.body.data.consents, {
        upiConsent: false,
        billStorageConsent: false,
        aiUsageConsent: false,
      });
    });

    it('should update (grant) consent flags successfully', async () => {
      const updateRes = await request(app)
        .post('/api/v1/consent')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({
          upiConsent: true,
          billStorageConsent: true,
          aiUsageConsent: false,
        });

      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.body.data.consents.upiConsent, true);
      assert.strictEqual(updateRes.body.data.consents.billStorageConsent, true);
      assert.strictEqual(updateRes.body.data.consents.aiUsageConsent, false);
      assert.strictEqual(updateRes.body.data.history.length, 2);
    });

    it('should BLOCK feature access when consent is not granted (403 Forbidden)', async () => {
      // UPI endpoint when upiConsent is false
      const upiRes = await request(app)
        .get('/api/v1/upi/transactions')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(upiRes.status, 403);
      assert.strictEqual(upiRes.body.success, false);
      assert.match(upiRes.body.message, /Consent for 'upiConsent' is revoked or not granted/i);

      // Bills endpoint when billStorageConsent is false
      const billsRes = await request(app)
        .get('/api/v1/bills/storage')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(billsRes.status, 403);

      // AI endpoint when aiUsageConsent is false
      const aiRes = await request(app)
        .post('/api/v1/ai/insights')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(aiRes.status, 403);
    });

    it('should ALLOW feature access when consent is granted', async () => {
      // Grant all consents
      await request(app)
        .post('/api/v1/consent')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({
          upiConsent: true,
          billStorageConsent: true,
          aiUsageConsent: true,
        });

      // Test UPI access
      const upiRes = await request(app)
        .get('/api/v1/upi/transactions')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(upiRes.status, 200);
      assert.strictEqual(upiRes.body.success, true);

      // Test Bills access
      const billsRes = await request(app)
        .get('/api/v1/bills/storage')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(billsRes.status, 200);

      // Test AI access
      const aiRes = await request(app)
        .post('/api/v1/ai/insights')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(aiRes.status, 200);
    });

    it('should IMMEDIATELY BLOCK access when a consent is revoked (Revocation Enforcement)', async () => {
      // 1. Grant AI usage consent
      await request(app)
        .post('/api/v1/consent')
        .set('Authorization', MOCK_AUTH_HEADER)
        .send({ aiUsageConsent: true });

      // Verify allowed
      const grantedAiRes = await request(app)
        .post('/api/v1/ai/insights')
        .set('Authorization', MOCK_AUTH_HEADER);
      assert.strictEqual(grantedAiRes.status, 200);

      // 2. Revoke AI usage consent via DELETE /api/v1/consent/aiUsage
      const revokeRes = await request(app)
        .delete('/api/v1/consent/aiUsage')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(revokeRes.status, 200);
      assert.strictEqual(revokeRes.body.data.consents.aiUsageConsent, false);

      // 3. Verify access is NOW BLOCKED (403 Forbidden)
      const revokedAiRes = await request(app)
        .post('/api/v1/ai/insights')
        .set('Authorization', MOCK_AUTH_HEADER);

      assert.strictEqual(revokedAiRes.status, 403);
      assert.strictEqual(revokedAiRes.body.success, false);
    });
  });
});
