import request from 'supertest';
import app from '../src/app.js';
import { AuditLogModel } from '../src/models/auditLog.model.js';
import { ClaimModel } from '../src/models/claim.model.js';
import { InviteCodeModel } from '../src/models/inviteCode.model.js';
import { EmployerModel } from '../src/models/employer.model.js';
import { auditService, GENESIS_HASH } from '../src/services/audit.service.js';
import { claimService } from '../src/services/claim.service.js';
import { employerService } from '../src/services/employer.service.js';
import { sanitizeAuditData } from '../src/utils/auditSanitizer.js';

beforeEach(async () => {
  await AuditLogModel.deleteMany({});
  await ClaimModel.deleteMany({});
  await InviteCodeModel.deleteMany({});
  await EmployerModel.deleteMany({});
});

describe('SCRUM-163: Audit Logging System', () => {
  // -------------------------------------------------------------
  // SCRUM-164: Tamper-Evident State Change Logging
  // -------------------------------------------------------------
  describe('SCRUM-164: Tamper-Evident State Change & Hash Chaining', () => {
    test('1. Creates genesis block with sequence 1 and GENESIS_HASH', async () => {
      const log = await auditService.logStateChange({
        action: 'SYSTEM_INITIALIZED',
        actor: { userId: 'admin_sys', role: 'SYSTEM' },
        target: { resourceType: 'SYSTEM', resourceId: 'main' },
        metadata: { version: '1.0.0' },
      });

      expect(log).toBeDefined();
      expect(log.sequence).toBe(1);
      expect(log.prevHash).toBe(GENESIS_HASH);
      expect(log.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(log.eventType).toBe('STATE_CHANGE');
    });

    test('2. Sequential logs cryptographically chain prevHash to previous hash', async () => {
      const log1 = await auditService.logStateChange({
        action: 'POLICY_CREATED',
        actor: { userId: 'admin_1', role: 'EMPLOYER' },
        target: { resourceType: 'POLICY', resourceId: 'pol_101' },
        metadata: { maxLimit: 50000 },
      });

      const log2 = await auditService.logStateChange({
        action: 'POLICY_UPDATED',
        actor: { userId: 'admin_1', role: 'EMPLOYER' },
        target: { resourceType: 'POLICY', resourceId: 'pol_101' },
        metadata: { maxLimit: 75000 },
      });

      expect(log2.sequence).toBe(2);
      expect(log2.prevHash).toBe(log1.hash);
      expect(log2.hash).not.toBe(log1.hash);

      const verification = await auditService.verifyAuditChain();
      expect(verification.isValid).toBe(true);
      expect(verification.totalChecked).toBe(2);
    });

    test('3. Claim submission and approval automatically record chained audit logs', async () => {
      // Setup employer linkage
      const invite = await employerService.generateInviteCode({
        companyId: 'COMP-AUDIT-01',
        companyName: 'Audit Systems India',
        department: 'Security',
        monthlyAllowance: 50000,
      });
      await employerService.claimInviteCode('user_audit_emp', invite.code, {
        name: 'Audit Employee',
        email: 'employee@auditsystems.in',
      });

      // Submit claim
      const claim = await claimService.submitClaim('user_audit_emp', {
        title: 'Security Cert Exam Fee',
        amount: 15000,
        category: 'Education & Training',
        project: 'Compliance',
        costCenter: 'CC-SEC-01',
      });

      // Approve claim
      await claimService.updateClaimStatus(
        claim.claimId,
        'Approved',
        'Certified compliance requirement',
        'admin_auditor'
      );

      const logs = await AuditLogModel.find({}).sort({ sequence: 1 });
      expect(logs.length).toBeGreaterThanOrEqual(2);

      const submitLog = logs.find((l) => l.action === 'CLAIM_SUBMITTED');
      const approveLog = logs.find((l) => l.action === 'CLAIM_APPROVED');

      expect(submitLog).toBeDefined();
      expect(submitLog.target.resourceId).toBe(claim.claimId);
      expect(submitLog.metadata.amount).toBe(15000);

      expect(approveLog).toBeDefined();
      expect(approveLog.metadata.previousStatus).toBe('Submitted');
      expect(approveLog.metadata.newStatus).toBe('Approved');
      expect(approveLog.prevHash).toBe(submitLog.hash);

      const chainCheck = await auditService.verifyAuditChain();
      expect(chainCheck.isValid).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // SCRUM-165: Data Access Event Logging
  // -------------------------------------------------------------
  describe('SCRUM-165: Sensitive Data Access Event Logging', () => {
    test('4. Accessing claims list triggers a DATA_ACCESS audit log with actor metadata', async () => {
      const res = await request(app)
        .get('/api/v1/claims')
        .set('User-Agent', 'FinTrack-Test-Agent/1.0')
        .set('X-Forwarded-For', '203.0.113.195');

      expect(res.status).toBe(200);

      // Allow background microtask to persist
      await new Promise((r) => setTimeout(r, 100));

      const accessLog = await AuditLogModel.findOne({
        eventType: 'DATA_ACCESS',
        action: 'CLAIM_LIST_VIEWED',
      });

      expect(accessLog).toBeDefined();
      expect(accessLog.actor.ip).toBe('203.0.113.195');
      expect(accessLog.actor.userAgent).toBe('FinTrack-Test-Agent/1.0');
      expect(accessLog.target.resourceType).toBe('CLAIM');
    });

    test('5. Accessing receipt images triggers RECEIPT_IMAGE_ACCESSED audit record', async () => {
      await request(app)
        .get('/api/v1/claims/claim_sample_123/receipt-image')
        .set('User-Agent', 'Mobile-Flutter/3.0')
        .set('X-Forwarded-For', '198.51.100.42');

      await new Promise((r) => setTimeout(r, 100));

      const receiptLog = await AuditLogModel.findOne({
        eventType: 'DATA_ACCESS',
        action: 'RECEIPT_IMAGE_ACCESSED',
      });

      expect(receiptLog).toBeDefined();
      expect(receiptLog.target.resourceId).toBe('claim_sample_123');
      expect(receiptLog.actor.ip).toBe('198.51.100.42');
    });
  });

  // -------------------------------------------------------------
  // SCRUM-166: Verification & Tamper Detection
  // -------------------------------------------------------------
  describe('SCRUM-166: Verification Suite & Tamper Detection', () => {
    test('6. Detects unauthorized database tampering (HASH_MISMATCH)', async () => {
      // Create 3 valid chained logs
      await auditService.logStateChange({
        action: 'TRANSACTION_APPROVED',
        actor: { userId: 'admin' },
        target: { resourceType: 'TX', resourceId: 'tx_1' },
        metadata: { amount: 500 },
      });

      await auditService.logStateChange({
        action: 'TRANSACTION_APPROVED',
        actor: { userId: 'admin' },
        target: { resourceType: 'TX', resourceId: 'tx_2' },
        metadata: { amount: 1000 },
      });

      await auditService.logStateChange({
        action: 'TRANSACTION_APPROVED',
        actor: { userId: 'admin' },
        target: { resourceType: 'TX', resourceId: 'tx_3' },
        metadata: { amount: 1500 },
      });

      // Verify chain is pristine
      const pristineCheck = await auditService.verifyAuditChain();
      expect(pristineCheck.isValid).toBe(true);

      // Simulate a malicious actor modifying record sequence 2 in MongoDB
      await AuditLogModel.collection.updateOne(
        { sequence: 2 },
        { $set: { 'metadata.amount': 99999 } }
      );

      // Verify audit service catches the alteration
      const tamperedCheck = await auditService.verifyAuditChain();
      expect(tamperedCheck.isValid).toBe(false);
      expect(tamperedCheck.error.type).toBe('HASH_MISMATCH');
      expect(tamperedCheck.error.sequence).toBe(2);
      expect(tamperedCheck.error.details).toContain('Tamper detected at sequence 2');
    });

    test('7. Detects deleted log entries in chain (CHAIN_BROKEN / SEQUENCE_GAP)', async () => {
      await auditService.logStateChange({
        action: 'STEP_1',
        actor: { userId: 'system' },
        target: { resourceType: 'SYSTEM', resourceId: 'step_1' },
      });

      await auditService.logStateChange({
        action: 'STEP_2',
        actor: { userId: 'system' },
        target: { resourceType: 'SYSTEM', resourceId: 'step_2' },
      });

      await auditService.logStateChange({
        action: 'STEP_3',
        actor: { userId: 'system' },
        target: { resourceType: 'SYSTEM', resourceId: 'step_3' },
      });

      // Maliciously delete sequence 2
      await AuditLogModel.collection.deleteOne({ sequence: 2 });

      const gapCheck = await auditService.verifyAuditChain();
      expect(gapCheck.isValid).toBe(false);
      expect(['CHAIN_BROKEN', 'SEQUENCE_GAP']).toContain(gapCheck.error.type);
      expect(gapCheck.error.sequence).toBe(3);
    });

    test('8. Sanitizes sensitive credentials and PII (passwords, tokens, PAN, card numbers)', () => {
      const sensitiveData = {
        password: 'PlainTextPassword123!',
        token: 'eySampleJwtTokenHere',
        authorization: 'Bearer super_secret_token',
        userPan: 'ABCDE1234F',
        creditCard: '4111222233334444',
        normalField: 'Normal Public String',
      };

      const sanitized = sanitizeAuditData(sensitiveData);

      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.userPan).toBe('AB****34F');
      expect(sanitized.creditCard).toBe('************4444');
      expect(sanitized.normalField).toBe('Normal Public String');
    });

    test('9. GET /api/v1/audit/verify endpoint returns 200 when untampered, 409 when tampered', async () => {
      await auditService.logStateChange({
        action: 'SYSTEM_STARTUP',
        actor: { userId: 'root' },
        target: { resourceType: 'SYSTEM', resourceId: 'srv_1' },
      });

      // Pristine endpoint call
      const cleanRes = await request(app).get('/api/v1/audit/verify');
      expect(cleanRes.status).toBe(200);
      expect(cleanRes.body.success).toBe(true);
      expect(cleanRes.body.data.isValid).toBe(true);

      // Corrupt hash
      await AuditLogModel.collection.updateOne(
        { sequence: 1 },
        { $set: { hash: 'tampered_invalid_hash_string_here' } }
      );

      const tamperedRes = await request(app).get('/api/v1/audit/verify');
      expect(tamperedRes.status).toBe(409);
      expect(tamperedRes.body.success).toBe(false);
      expect(tamperedRes.body.errors.isValid).toBe(false);
      expect(tamperedRes.body.errors.error.type).toBe('HASH_MISMATCH');
    });
  });
});
