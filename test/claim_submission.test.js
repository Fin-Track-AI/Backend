import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'path';
import app from '../src/app.js';
import { employerService } from '../src/services/employer.service.js';
import { consentService } from '../src/services/consent.service.js';
import { billService } from '../src/services/bill.service.js';
import { claimService } from '../src/services/claim.service.js';

const USER_A_AUTH = 'Bearer user_a_token';
const USER_B_AUTH = 'Bearer user_b_token';
const FIXTURES_DIR = path.join(process.cwd(), 'test', 'fixtures');

describe('BR-12 & SCRUM-33: Claim Submission Flow Tests', () => {
  beforeEach(async () => {
    employerService._clearStore();
    consentService._clearStore();
    billService._clearStore();
    claimService._clearStore();

    // Enable billStorageConsent for User A and User B
    await consentService.updateConsents('user_a', { billStorageConsent: true });
    await consentService.updateConsents('user_b', { billStorageConsent: true });
  });

  describe('Employer Linkage Validation (SCRUM-33)', () => {
    it('should REJECT claim submission if user has no linked employer', async () => {
      // 1. Upload a bill first
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      const billId = uploadRes.body.data.id;

      // 2. Submit claim without linking employer
      const response = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', USER_A_AUTH)
        .send({
          title: 'Dinner with Clients',
          amount: 125.50,
          category: 'Meals & Entertainment',
          project: 'Project Alpha',
          costCenter: 'CC-102-FINANCE',
          billId,
        });

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.body.success, false);
      assert.match(response.body.message, /No linked employer found/i);
    });
  });

  describe('Mandatory Field Selection Validation', () => {
    beforeEach(async () => {
      // Link employer for User A
      await employerService.linkEmployer('user_a', { employerName: 'Acme Corp' });
    });

    it('should REJECT claim submission if category is missing', async () => {
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      const response = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', USER_A_AUTH)
        .send({
          title: 'Client Lunch',
          amount: 50.00,
          category: '', // missing
          project: 'Project Alpha',
          costCenter: 'CC-102',
          billId: uploadRes.body.data.id,
        });

      assert.strictEqual(response.status, 400);
      assert.match(response.body.message, /category selection is required/i);
    });

    it('should REJECT claim submission if project is missing', async () => {
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      const response = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', USER_A_AUTH)
        .send({
          title: 'Client Lunch',
          amount: 50.00,
          category: 'Meals',
          project: '', // missing
          costCenter: 'CC-102',
          billId: uploadRes.body.data.id,
        });

      assert.strictEqual(response.status, 400);
      assert.match(response.body.message, /Project selection is required/i);
    });

    it('should REJECT claim submission if cost center is missing', async () => {
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      const response = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', USER_A_AUTH)
        .send({
          title: 'Client Lunch',
          amount: 50.00,
          category: 'Meals',
          project: 'Project Alpha',
          costCenter: '', // missing
          billId: uploadRes.body.data.id,
        });

      assert.strictEqual(response.status, 400);
      assert.match(response.body.message, /Cost center selection is required/i);
    });
  });

  describe('End-to-End Claim Submission & "My Claims" View', () => {
    beforeEach(async () => {
      await employerService.linkEmployer('user_a', { employerName: 'Tech Corp' });
    });

    it('should successfully submit claim, tag reimbursable, link employer, and receive status Submitted', async () => {
      // 1. Upload receipt bill
      const imgPath = path.join(FIXTURES_DIR, 'receipt_printed.png');
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      assert.strictEqual(uploadRes.status, 201);
      const billId = uploadRes.body.data.id;

      // 2. Submit Claim
      const response = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', USER_A_AUTH)
        .send({
          title: 'Team Dinner',
          amount: 125.50,
          category: 'Meals & Dining',
          project: 'Project Beta',
          costCenter: 'CC-300-ENG',
          billId,
        });

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.body.success, true);

      const claim = response.body.data;
      assert.strictEqual(claim.status, 'Submitted');
      assert.strictEqual(claim.isReimbursable, true);
      assert.strictEqual(claim.employerName, 'Tech Corp');
      assert.strictEqual(claim.category, 'Meals & Dining');
      assert.strictEqual(claim.project, 'Project Beta');
      assert.strictEqual(claim.costCenter, 'CC-300-ENG');
      assert.strictEqual(claim.billId, billId);
    });

    it('should display submitted claim in "My Claims" view', async () => {
      // Upload & Submit
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      await request(app)
        .post('/api/v1/claims')
        .set('Authorization', USER_A_AUTH)
        .send({
          title: 'Flight Ticket',
          amount: 450.00,
          category: 'Travel',
          project: 'Global Conference',
          costCenter: 'CC-500-EXEC',
          billId: uploadRes.body.data.id,
        });

      // Get My Claims
      const myClaimsRes = await request(app)
        .get('/api/v1/claims/my-claims')
        .set('Authorization', USER_A_AUTH);

      assert.strictEqual(myClaimsRes.status, 200);
      assert.strictEqual(myClaimsRes.body.success, true);

      const claimsList = myClaimsRes.body.data.claims;
      assert.ok(claimsList.length > 0);
      assert.strictEqual(claimsList[0].title, 'Flight Ticket');
      assert.strictEqual(claimsList[0].status, 'Submitted');
      assert.strictEqual(claimsList[0].employerName, 'Tech Corp');
    });

    it('should BLOCK User B from viewing User A claims (Tenant Isolation)', async () => {
      // Upload & Submit by User A
      const imgPath = path.join(FIXTURES_DIR, 'receipt_restaurant.jpg');
      const uploadRes = await request(app)
        .post('/api/v1/bills/upload')
        .set('Authorization', USER_A_AUTH)
        .attach('billImage', imgPath);

      const claimRes = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', USER_A_AUTH)
        .send({
          title: 'Private Claim',
          amount: 200.00,
          category: 'Equipment',
          project: 'Project Alpha',
          costCenter: 'CC-101',
          billId: uploadRes.body.data.id,
        });

      const claimId = claimRes.body.data.id;

      // User B attempts to access User A claim details
      const unauthorizedRes = await request(app)
        .get(`/api/v1/claims/${claimId}`)
        .set('Authorization', USER_B_AUTH);

      assert.strictEqual(unauthorizedRes.status, 403);
      assert.strictEqual(unauthorizedRes.body.success, false);
      assert.match(unauthorizedRes.body.message, /Access denied: You do not own this claim/i);
    });
  });
});
