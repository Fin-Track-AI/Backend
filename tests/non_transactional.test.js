import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../src/app.js';
import { AuditLogModel } from '../src/models/auditLog.model.js';
import { ClaimModel } from '../src/models/claim.model.js';
import { InviteCodeModel } from '../src/models/inviteCode.model.js';
import { EmployerModel } from '../src/models/employer.model.js';
import { claimService } from '../src/services/claim.service.js';
import { employerService } from '../src/services/employer.service.js';
import { consentService } from '../src/services/consent.service.js';
import { FORBIDDEN_TRANSACTIONAL_KEYS, findForbiddenKey } from '../src/middlewares/safeguard.middleware.js';

beforeEach(async () => {
  await AuditLogModel.deleteMany({});
  await ClaimModel.deleteMany({});
  await InviteCodeModel.deleteMany({});
  await EmployerModel.deleteMany({});
});

describe('SCRUM-159: Non-Transactional Boundary Safeguards', () => {
  // -------------------------------------------------------------
  // SCRUM-160: Endpoint & Dependency Audit
  // -------------------------------------------------------------
  describe('SCRUM-160: Audit all endpoints & dependencies for payment-initiation capability', () => {
    test('1. Dependency Audit: package.json must not include payment gateway or banking payout SDKs', () => {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      const allDeps = {
        ...(pkgJson.dependencies || {}),
        ...(pkgJson.devDependencies || {}),
      };

      const forbiddenSdks = [
        'razorpay',
        'stripe',
        'cashfree-sdk',
        'paypal-rest-sdk',
        'plaid',
        'dwolla',
      ];

      for (const sdk of forbiddenSdks) {
        expect(allDeps[sdk]).toBeUndefined();
      }
    });

    test('2. Endpoint Audit: No registered Express route exposes payment initiation, payout, or disbursement verbs', () => {
      const forbiddenRoutePatterns = [
        /\/payout/i,
        /\/disburse/i,
        /\/wire/i,
        /\/charge/i,
        /\/withdraw/i,
        /\/bank-transfer/i,
      ];

      // Extract all route paths from Express router stack
      function extractRoutes(stack, basePath = '') {
        let routes = [];
        for (const layer of stack) {
          if (layer.route && layer.route.path) {
            routes.push(basePath + layer.route.path);
          } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            const match = layer.regexp.source.replace('\\/?(?=\\/|$)', '').replace('^\\', '').replace('\\', '');
            const cleanPrefix = match.replace(/\\\//g, '/').replace(/\$$/, '');
            routes = routes.concat(extractRoutes(layer.handle.stack, cleanPrefix));
          }
        }
        return routes;
      }

      const registeredRoutes = extractRoutes(app._router.stack);
      expect(registeredRoutes.length).toBeGreaterThan(10);

      for (const route of registeredRoutes) {
        for (const pattern of forbiddenRoutePatterns) {
          expect(route).not.toMatch(pattern);
        }
      }
    });

    test('3. UPI Route Audit: /api/v1/upi only returns informational read ledger data without payout execution', async () => {
      await consentService.updateConsents('usr_me', { upiConsent: true });

      const res = await request(app).get('/api/v1/upi/transactions');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify no payment gateway tokens or initiation URLs are returned
      expect(res.body.data.transactions).toBeDefined();
      for (const tx of res.body.data.transactions) {
        expect(tx.payoutGatewayUrl).toBeUndefined();
        expect(tx.wireId).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------
  // SCRUM-161: Safeguard Checks Preventing Fund-Movement Paths
  // -------------------------------------------------------------
  describe('SCRUM-161: Safeguard checks preventing fund-movement code paths', () => {
    test('4. Utility test: findForbiddenKey correctly identifies prohibited payout parameters in nested payloads', () => {
      expect(findForbiddenKey({ beneficiaryIfsc: 'HDFC0001234' })).toBe('beneficiaryIfsc');
      expect(findForbiddenKey({ nested: { payoutMethod: 'IMPS' } })).toBe('payoutMethod');
      expect(findForbiddenKey({ list: [{ autoDebitMandate: true }] })).toBe('autoDebitMandate');
      expect(findForbiddenKey({ title: 'Dinner at Bistro', amount: 500, category: 'Food' })).toBeNull();
    });

    test('5. Blocks request with HTTP 403 when forbidden payout key (e.g. beneficiaryIfsc) is present in body', async () => {
      const res = await request(app)
        .post('/api/v1/transactions')
        .send({
          title: 'Direct wire to vendor',
          amount: 5000,
          type: 'expense',
          beneficiaryIfsc: 'HDFC0001234', // Forbidden payout key!
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('FinTrack AI operates strictly as a non-transactional ledger');
      expect(res.body.errors.complianceStatus).toBe('NON_TRANSACTIONAL_VIOLATION');
      expect(res.body.errors.forbiddenKey).toBe('beneficiaryIfsc');

      // Verify security alert was logged to tamper-evident audit ledger
      await new Promise((r) => setTimeout(r, 100));
      const auditLog = await AuditLogModel.findOne({
        action: 'FUND_MOVEMENT_BLOCKED',
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.metadata.forbiddenKeyDetected).toBe('beneficiaryIfsc');
    });

    test('6. Blocks request when forbidden auto-debit parameter is sent in query params', async () => {
      const res = await request(app)
        .get('/api/v1/claims?autoDebitMandate=true');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errors.forbiddenKey).toBe('autoDebitMandate');
    });

    test('7. Normal expense tracking requests without fund-movement keys pass without hindrance', async () => {
      const res = await request(app)
        .post('/api/v1/transactions')
        .send({
          title: 'Starbucks Coffee',
          amount: 350,
          type: 'expense',
          category: 'Food & Dining',
          paidVia: 'UPI',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Starbucks Coffee');
    });

    test('8. Domain Safeguard: Claim approval explicitly stamps OFFLINE_PAYROLL_EXTERNAL and prevents automated fund movement', async () => {
      const invite = await employerService.generateInviteCode({
        companyId: 'COMP-NONTRANS-01',
        companyName: 'NonTransactional Corp',
        department: 'Finance',
      });
      await employerService.claimInviteCode('user_emp_safe', invite.code, {
        name: 'Finance Employee',
        email: 'emp@nontrans.in',
      });

      const claim = await claimService.submitClaim('user_emp_safe', {
        title: 'Office Stationery',
        amount: 2500,
        category: 'Office Supplies',
        project: 'Admin',
        costCenter: 'CC-ADMIN-01',
      });

      const updated = await claimService.updateClaimStatus(
        claim.claimId,
        'Approved',
        'Approved for next payroll cycle',
        'manager_admin'
      );

      expect(updated.status).toBe('Approved');
      expect(updated.settlementMethod).toBe('OFFLINE_PAYROLL_EXTERNAL');
      expect(updated.isFundMovementPrevented).toBe(true);

      const dbClaim = await ClaimModel.findOne({ claimId: claim.claimId });
      expect(dbClaim.settlementMethod).toBe('OFFLINE_PAYROLL_EXTERNAL');
      expect(dbClaim.isFundMovementPrevented).toBe(true);
    });
  });
});
