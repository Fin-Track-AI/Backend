import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../src/app.js';
import { ClaimModel } from '../src/models/claim.model.js';
import { BillModel } from '../src/models/bill.model.js';
import { TransactionModel } from '../src/models/transaction.model.js';
import { UserModel } from '../src/models/user.model.js';
import { AuditLogModel } from '../src/models/auditLog.model.js';
import { InviteCodeModel } from '../src/models/inviteCode.model.js';
import { EmployerModel } from '../src/models/employer.model.js';
import { claimService } from '../src/services/claim.service.js';
import { employerService } from '../src/services/employer.service.js';
import { retentionService } from '../src/services/retention.service.js';

beforeEach(async () => {
  await ClaimModel.deleteMany({});
  await BillModel.deleteMany({});
  await TransactionModel.deleteMany({});
  await UserModel.deleteMany({});
  await AuditLogModel.deleteMany({});
  await InviteCodeModel.deleteMany({});
  await EmployerModel.deleteMany({});
});

describe('SCRUM-154: Data Retention & Purge Policy', () => {
  // -------------------------------------------------------------
  // SCRUM-155: 5-Year Retention Flag & Statutory Lock
  // -------------------------------------------------------------
  describe('SCRUM-155: Implement 5-year retention flag and statutory lock on records', () => {
    test('1. Claim creation automatically calculates 5-year retention flag and stamps statutory metadata', async () => {
      const invite = await employerService.generateInviteCode({
        companyId: 'COMP-RETENTION-01',
        companyName: 'Retention Systems India',
      });
      await employerService.claimInviteCode('user_ret_1', invite.code, {
        name: 'Retention Tester',
        email: 'tester@retention.in',
      });

      const claim = await claimService.submitClaim('user_ret_1', {
        title: 'Cloud Certification Fee',
        amount: 8000,
        category: 'Education & Training',
      });

      expect(claim.isStatutoryRetention).toBe(true);
      expect(claim.retentionCategory).toBe('STATUTORY_5_YEAR');
      expect(claim.retentionStatus).toBe('ACTIVE');

      const expectedFiveYearsLaterMs = Date.now() + 5 * 365 * 24 * 60 * 60 * 1000;
      const actualRetentionMs = new Date(claim.retentionUntil).getTime();

      // Within 1 minute tolerance
      expect(Math.abs(actualRetentionMs - expectedFiveYearsLaterMs)).toBeLessThan(60000);
    });

    test('2. Prevents premature deletion of active statutory claims (STATUTORY_RETENTION_LOCKED)', async () => {
      const invite = await employerService.generateInviteCode({
        companyId: 'COMP-RETENTION-01',
        companyName: 'Retention Systems India',
      });
      await employerService.claimInviteCode('user_ret_2', invite.code, {
        name: 'Second Employee',
      });

      const claim = await claimService.submitClaim('user_ret_2', {
        title: 'Team Client Lunch',
        amount: 3200,
        category: 'Food & Dining',
      });

      // Attempt deletion without force override
      await expect(claimService.deleteClaim(claim.claimId)).rejects.toThrow(
        /Cannot delete claim '.*': Record is protected under statutory financial retention/
      );

      // Verify claim still exists in DB
      const existing = await ClaimModel.findOne({ claimId: claim.claimId });
      expect(existing).toBeDefined();

      // Deletion with force override succeeds for testing/maintenance
      const forceResult = await claimService.deleteClaim(claim.claimId, { force: true });
      expect(forceResult.deleted).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // SCRUM-156 & SCRUM-158: Automated Purge Worker Verification
  // -------------------------------------------------------------
  describe('SCRUM-156 & SCRUM-158: Automated purge job execution on test data', () => {
    test('3. Purge job leaves active records untouched when evaluated at current date', async () => {
      await ClaimModel.create({
        claimId: 'claim_active_1',
        userId: 'usr_active',
        employerId: 'emp_1',
        employerName: 'Corp',
        title: 'Active Expense',
        amount: 1200,
        category: 'General',
        project: 'Ops',
        costCenter: 'CC-101',
        retentionUntil: new Date(Date.now() + 4 * 365 * 24 * 60 * 60 * 1000), // expires in 4 years
        retentionStatus: 'ACTIVE',
      });

      const result = await retentionService.runPurgeJob({ targetDate: new Date() });

      expect(result.success).toBe(true);
      expect(result.stats.claimsPurged).toBe(0);

      const stillActive = await ClaimModel.findOne({ claimId: 'claim_active_1' });
      expect(stillActive.retentionStatus).toBe('ACTIVE');
    });

    test('4. Purge job sweeps expired records, unlinks physical files, and marks documents as PURGED', async () => {
      // Create a temporary mock receipt file on disk in uploads/
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const testFilePath = path.join(uploadsDir, `test_purge_${Date.now()}.jpg`);
      fs.writeFileSync(testFilePath, 'dummy test receipt image content');

      // Create expired bill and claim records (5 years ago)
      const pastDate = new Date(Date.now() - 10000); // already expired

      await BillModel.create({
        billId: 'bill_expired_1',
        userId: 'usr_old',
        originalName: 'old_receipt.jpg',
        storageKey: 'key_1',
        filePath: testFilePath,
        retentionUntil: pastDate,
        retentionStatus: 'ACTIVE',
      });

      await ClaimModel.create({
        claimId: 'claim_expired_1',
        userId: 'usr_old',
        employerId: 'emp_1',
        employerName: 'Corp',
        title: 'Old Expired Travel',
        amount: 4500,
        category: 'Travel',
        project: 'Ops',
        costCenter: 'CC-101',
        retentionUntil: pastDate,
        retentionStatus: 'ACTIVE',
      });

      // Execute purge job
      const purgeResult = await retentionService.runPurgeJob({ targetDate: new Date() });

      expect(purgeResult.success).toBe(true);
      expect(purgeResult.stats.claimsPurged).toBe(1);
      expect(purgeResult.stats.billsPurged).toBe(1);
      expect(purgeResult.stats.filesUnlinked).toBe(1);

      // Verify physical file was unlinked from disk
      expect(fs.existsSync(testFilePath)).toBe(false);

      // Verify DB record status transitioned to PURGED
      const purgedClaim = await ClaimModel.findOne({ claimId: 'claim_expired_1' });
      expect(purgedClaim.retentionStatus).toBe('PURGED');

      // Verify audit log generated for purge event
      const purgeAudit = await AuditLogModel.findOne({ action: 'DATA_PURGE_COMPLETED' });
      expect(purgeAudit).toBeDefined();
      expect(purgeAudit.metadata.claimsPurged).toBe(1);
    });

    test('5. POST /api/v1/retention/purge-job and GET /api/v1/retention/metrics endpoints work as expected', async () => {
      const purgeRes = await request(app).post('/api/v1/retention/purge-job').send({ dryRun: true });
      expect(purgeRes.status).toBe(200);
      expect(purgeRes.body.success).toBe(true);
      expect(purgeRes.body.data.dryRun).toBe(true);

      const metricsRes = await request(app).get('/api/v1/retention/metrics');
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.body.success).toBe(true);
      expect(metricsRes.body.data.statutoryStandard).toBe('5_YEARS_INCOME_TAX_ACT_SEC_44AA');
    });
  });

  // -------------------------------------------------------------
  // SCRUM-157: User-Requested Early Deletion Path
  // -------------------------------------------------------------
  describe('SCRUM-157: Implement user-requested early deletion path (DPDP Right to Erasure)', () => {
    test('6. Deletes user profile and personal expenses while anonymizing statutory corporate claims', async () => {
      // 1. Create a user
      const user = await UserModel.create({
        email: 'erasure.test@domain.in',
        name: 'Privacy Minded User',
        phone: '+919988776655',
        salary: 120000,
        rent: 30000,
      });

      const userId = user._id.toString();

      // 2. Create personal non-statutory transaction
      await TransactionModel.create({
        userId,
        title: 'Personal Movie Ticket',
        amount: 450,
        type: 'expense',
        isReimbursable: false,
      });

      // 3. Create corporate statutory claim submitted to company
      await ClaimModel.create({
        claimId: 'claim_corp_statutory_1',
        userId,
        employerId: 'COMP-ERASURE-01',
        employerName: 'Acme Technologies',
        title: 'Client Dinner Meeting',
        amount: 4200,
        category: 'Food & Dining',
        project: 'Sales Expansion',
        costCenter: 'CC-SALES-01',
        status: 'Approved',
        isStatutoryRetention: true,
      });

      // 4. User requests early account deletion via DELETE /api/v1/auth/account
      const { UserService } = await import('../src/services/user.service.js');
      const userToken = UserService.generateToken(user);

      const res = await request(app)
        .delete('/api/v1/auth/account')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.anonymizedClaimsCount).toBe(1);
      expect(res.body.data.deletedTransactionsCount).toBe(1);

      // 5. Verify User Profile is completely erased from UserModel
      const deletedUser = await UserModel.findById(userId);
      expect(deletedUser).toBeNull();

      // 6. Verify Personal Non-Reimbursable Transaction was deleted
      const personalTx = await TransactionModel.findOne({ userId, isReimbursable: false });
      expect(personalTx).toBeNull();

      // 7. Verify Corporate Claim was NOT destroyed, but ANONYMIZED for employer tax records
      const preservedClaim = await ClaimModel.findOne({ claimId: 'claim_corp_statutory_1' });
      expect(preservedClaim).toBeDefined();
      expect(preservedClaim.isAnonymized).toBe(true);
      expect(preservedClaim.userId).not.toBe(userId);
      expect(preservedClaim.userId).toMatch(/^anon_/);
      expect(preservedClaim.amount).toBe(4200); // Tax voucher amount preserved
      expect(preservedClaim.employerName).toBe('Acme Technologies');

      // 8. Verify Audit Log recorded the erasure event
      const erasureAudit = await AuditLogModel.findOne({ action: 'USER_ACCOUNT_ERASED' });
      expect(erasureAudit).toBeDefined();
      expect(erasureAudit.metadata.complianceType).toBe('DPDP_RIGHT_TO_ERASURE');
    });
  });
});
