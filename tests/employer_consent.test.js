import request from 'supertest';
import app from '../src/app.js';
import { employerService } from '../src/services/employer.service.js';
import { consentService } from '../src/services/consent.service.js';

/**
 * Employer Linking & Consent Management Tests
 * Covers: BR-02 (Employer Linking) & BR-03 (Consent Management & Revocation)
 *
 * Originally written with node:test runner — migrated to Jest to align with
 * the project's unified test setup (Jest + Supertest, see tests/health.test.js).
 */

const MOCK_AUTH_HEADER = 'Bearer mock_token_123';

beforeEach(() => {
  employerService._clearStore();
  consentService._clearStore();
});

describe('BR-02: Employer Linking', () => {
  it('should link an employer successfully when none is currently linked', async () => {
    const res = await request(app)
      .post('/api/v1/employer/link')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({
        employerName: 'Acme Corp',
        corporateEmail: 'john@acme.corp',
        employeeId: 'EMP-99',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employerName).toBe('Acme Corp');
    expect(res.body.data.corporateEmail).toBe('john@acme.corp');
    expect(res.body.data.verificationStatus).toBe('VERIFIED');
  });

  it('should retrieve the currently linked employer', async () => {
    await request(app)
      .post('/api/v1/employer/link')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({ employerName: 'TechSolutions Inc' });

    const res = await request(app)
      .get('/api/v1/employer')
      .set('Authorization', MOCK_AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.linked).toBe(true);
    expect(res.body.data.employer.employerName).toBe('TechSolutions Inc');
  });

  it('should REJECT linking a second employer if one is already linked (Single Employer Rule)', async () => {
    await request(app)
      .post('/api/v1/employer/link')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({ employerName: 'First Employer' });

    const res = await request(app)
      .post('/api/v1/employer/link')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({ employerName: 'Second Employer' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already has a linked employer/i);
  });

  it('should allow unlinking an employer and then linking a new one', async () => {
    await request(app)
      .post('/api/v1/employer/link')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({ employerName: 'Old Employer' });

    const unlinkRes = await request(app)
      .delete('/api/v1/employer/unlink')
      .set('Authorization', MOCK_AUTH_HEADER);

    expect(unlinkRes.status).toBe(200);
    expect(unlinkRes.body.success).toBe(true);

    const getRes = await request(app)
      .get('/api/v1/employer')
      .set('Authorization', MOCK_AUTH_HEADER);
    expect(getRes.body.data.linked).toBe(false);

    const relinkRes = await request(app)
      .post('/api/v1/employer/link')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({ employerName: 'New Employer' });

    expect(relinkRes.status).toBe(201);
    expect(relinkRes.body.data.employerName).toBe('New Employer');
  });
});

describe('BR-03: Consent Management & Revocation Enforcement', () => {
  it('should return default consents (all false) for a new user', async () => {
    const res = await request(app)
      .get('/api/v1/consent')
      .set('Authorization', MOCK_AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.consents).toEqual({
      upiConsent: false,
      billStorageConsent: false,
      aiUsageConsent: false,
    });
  });

  it('should update (grant) consent flags successfully', async () => {
    const res = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({
        upiConsent: true,
        billStorageConsent: true,
        aiUsageConsent: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.consents.upiConsent).toBe(true);
    expect(res.body.data.consents.billStorageConsent).toBe(true);
    expect(res.body.data.consents.aiUsageConsent).toBe(false);
    expect(res.body.data.history.length).toBe(2);
  });

  it('should BLOCK feature access when consent is not granted (403 Forbidden)', async () => {
    const upiRes = await request(app)
      .get('/api/v1/upi/transactions')
      .set('Authorization', MOCK_AUTH_HEADER);
    expect(upiRes.status).toBe(403);
    expect(upiRes.body.success).toBe(false);
    expect(upiRes.body.message).toMatch(/Consent for 'upiConsent' is revoked or not granted/i);

    const billsRes = await request(app)
      .get('/api/v1/bills/storage')
      .set('Authorization', MOCK_AUTH_HEADER);
    expect(billsRes.status).toBe(403);

    const aiRes = await request(app)
      .post('/api/v1/ai/insights')
      .set('Authorization', MOCK_AUTH_HEADER);
    expect(aiRes.status).toBe(403);
  });

  it('should ALLOW feature access when consent is granted', async () => {
    await request(app)
      .post('/api/v1/consent')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({ upiConsent: true, billStorageConsent: true, aiUsageConsent: true });

    const upiRes = await request(app).get('/api/v1/upi/transactions').set('Authorization', MOCK_AUTH_HEADER);
    expect(upiRes.status).toBe(200);
    expect(upiRes.body.success).toBe(true);

    const billsRes = await request(app).get('/api/v1/bills/storage').set('Authorization', MOCK_AUTH_HEADER);
    expect(billsRes.status).toBe(200);

    const aiRes = await request(app).post('/api/v1/ai/insights').set('Authorization', MOCK_AUTH_HEADER);
    expect(aiRes.status).toBe(200);
  });

  it('should IMMEDIATELY BLOCK access when a consent is revoked (Revocation Enforcement)', async () => {
    await request(app)
      .post('/api/v1/consent')
      .set('Authorization', MOCK_AUTH_HEADER)
      .send({ aiUsageConsent: true });

    const grantedRes = await request(app)
      .post('/api/v1/ai/insights')
      .set('Authorization', MOCK_AUTH_HEADER);
    expect(grantedRes.status).toBe(200);

    const revokeRes = await request(app)
      .delete('/api/v1/consent/aiUsage')
      .set('Authorization', MOCK_AUTH_HEADER);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.consents.aiUsageConsent).toBe(false);

    const revokedRes = await request(app)
      .post('/api/v1/ai/insights')
      .set('Authorization', MOCK_AUTH_HEADER);
    expect(revokedRes.status).toBe(403);
    expect(revokedRes.body.success).toBe(false);
  });
});
