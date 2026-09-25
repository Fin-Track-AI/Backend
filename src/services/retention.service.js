import fs from 'fs';
import mongoose from 'mongoose';
import { ClaimModel } from '../models/claim.model.js';
import { BillModel } from '../models/bill.model.js';
import { TransactionModel } from '../models/transaction.model.js';
import { UserModel } from '../models/user.model.js';
import { ConsentModel } from '../models/consent.model.js';
import { OtpModel } from '../models/otp.model.js';
import { auditService } from './audit.service.js';

export const retentionService = {
  /**
   * Run automated data retention & purge worker (SCRUM-156).
   * Identifies records past their statutory retention date (retentionUntil <= targetDate),
   * unlinks physical files from uploads/ disk, marks documents as PURGED, and cleans transient OTPs.
   *
   * @param {Object} options
   * @param {boolean} [options.dryRun=false] - Preview without actual deletion
   * @param {Date} [options.targetDate=new Date()] - Reference cutoff date for purge evaluation
   */
  runPurgeJob: async ({ dryRun = false, targetDate = new Date() } = {}) => {
    const cutoff = new Date(targetDate);

    // 1. Identify Expired Claims
    const expiredClaims = await ClaimModel.find({
      retentionUntil: { $lte: cutoff },
      retentionStatus: { $ne: 'PURGED' },
    }).lean();

    // 2. Identify Expired Bills
    const expiredBills = await BillModel.find({
      retentionUntil: { $lte: cutoff },
      retentionStatus: { $ne: 'PURGED' },
    }).lean();

    // 3. Identify Expired Transactions
    const expiredTransactions = await TransactionModel.find({
      retentionUntil: { $lte: cutoff },
      retentionStatus: { $ne: 'PURGED' },
    }).lean();

    let filesUnlinked = 0;
    const claimsPurged = expiredClaims.length;
    const billsPurged = expiredBills.length;
    const transactionsPurged = expiredTransactions.length;
    let otpsPurged = 0;

    if (!dryRun) {
      // Unlink physical bill image files on disk
      for (const bill of expiredBills) {
        if (bill.filePath && fs.existsSync(bill.filePath)) {
          try {
            fs.unlinkSync(bill.filePath);
            filesUnlinked++;
          } catch (err) {
            console.warn(`[Retention File Unlink Warning]: ${bill.filePath}:`, err.message);
          }
        }
      }

      // Mark Claims as PURGED
      if (expiredClaims.length > 0) {
        const claimIds = expiredClaims.map((c) => c._id);
        await ClaimModel.updateMany(
          { _id: { $in: claimIds } },
          { $set: { retentionStatus: 'PURGED' } }
        );
      }

      // Mark Bills as PURGED
      if (expiredBills.length > 0) {
        const billIds = expiredBills.map((b) => b._id);
        await BillModel.updateMany(
          { _id: { $in: billIds } },
          { $set: { retentionStatus: 'PURGED' } }
        );
      }

      // Mark Transactions as PURGED
      if (expiredTransactions.length > 0) {
        const txIds = expiredTransactions.map((t) => t._id);
        await TransactionModel.updateMany(
          { _id: { $in: txIds } },
          { $set: { retentionStatus: 'PURGED' } }
        );
      }

      // Clean up expired temporary OTPs
      const otpRes = await OtpModel.deleteMany({ expiresAt: { $lte: cutoff } });
      otpsPurged = otpRes.deletedCount || 0;

      // Log purge audit event
      await auditService.logEvent({
        eventType: 'SYSTEM_EVENT',
        action: 'DATA_PURGE_COMPLETED',
        actor: { userId: 'system_retention_worker', role: 'SYSTEM' },
        target: { resourceType: 'RETENTION_PURGE_JOB' },
        metadata: {
          cutoffDate: cutoff.toISOString(),
          claimsPurged,
          billsPurged,
          transactionsPurged,
          filesUnlinked,
          otpsPurged,
          dryRun,
        },
      });
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      dryRun,
      cutoffDate: cutoff.toISOString(),
      stats: {
        claimsPurged,
        billsPurged,
        transactionsPurged,
        filesUnlinked,
        otpsPurged,
      },
    };
  },

  /**
   * Execute User-Requested Early Account Erasure (SCRUM-157).
   * Implements India's DPDP Act 2023 Sec 12 Right to Erasure & GDPR Art 17:
   * 1. Completely scrubs user identity & credentials from UserModel.
   * 2. Deletes personal budgets, non-reimbursed transactions, and DPDP consent settings.
   * 3. Pseudonymizes / anonymizes corporate reimbursement claims to preserve
   *    employer statutory tax accounting under Section 44AA of Income Tax Act.
   */
  executeUserEarlyDeletion: async (userId, actor = {}) => {
    let user = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await UserModel.findById(userId);
    }
    if (!user) {
      user = await UserModel.findOne({
        $or: [{ email: userId }, { phone: userId }],
      });
    }

    if (!user) {
      const err = new Error(`User '${userId}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const resolvedUserId = user._id.toString();
    const anonymizedUserId = `anon_${resolvedUserId.slice(-6)}_${Date.now().toString().slice(-4)}`;

    // 1. Anonymize Corporate Reimbursement Claims (preserving company accounting vouchers)
    const claimsRes = await ClaimModel.updateMany(
      { $or: [{ userId: resolvedUserId }, { userId }] },
      {
        $set: {
          userId: anonymizedUserId,
          isAnonymized: true,
          anonymizedAt: new Date(),
        },
      }
    );

    // 2. Delete non-statutory personal transactions
    const txRes = await TransactionModel.deleteMany({
      $or: [{ userId: resolvedUserId }, { userId }],
      isReimbursable: false,
    });

    // 3. Delete user's DPDP consent record
    await ConsentModel.deleteMany({
      $or: [{ userId: resolvedUserId }, { userId }],
    });

    // 4. Scrub User Profile & Credentials completely from UserModel
    await UserModel.deleteOne({ _id: user._id });

    // 5. Record non-repudiable audit event
    await auditService.logEvent({
      eventType: 'SYSTEM_EVENT',
      action: 'USER_ACCOUNT_ERASED',
      actor: {
        userId: actor.userId || userId,
        role: actor.role || 'USER',
        ip: actor.ip || '',
      },
      target: {
        resourceType: 'USER_ACCOUNT',
        resourceId: anonymizedUserId,
      },
      metadata: {
        complianceType: 'DPDP_RIGHT_TO_ERASURE',
        anonymizedClaimsCount: claimsRes.modifiedCount || 0,
        deletedTransactionsCount: txRes.deletedCount || 0,
        scrubbedProfileId: userId,
      },
    });

    return {
      success: true,
      message: 'User account and personal data erased successfully. Corporate claims anonymized for statutory compliance.',
      data: {
        erasedUserId: userId,
        anonymizedClaimsCount: claimsRes.modifiedCount || 0,
        deletedTransactionsCount: txRes.deletedCount || 0,
      },
    };
  },

  /**
   * Get retention and statutory metrics for compliance dashboards.
   */
  getRetentionMetrics: async () => {
    const now = new Date();

    const [
      activeStatutoryClaims,
      expiredClaims,
      purgedClaims,
      activeBills,
      expiredBills,
    ] = await Promise.all([
      ClaimModel.countDocuments({
        isStatutoryRetention: true,
        retentionUntil: { $gt: now },
        retentionStatus: 'ACTIVE',
      }),
      ClaimModel.countDocuments({
        retentionUntil: { $lte: now },
        retentionStatus: { $ne: 'PURGED' },
      }),
      ClaimModel.countDocuments({ retentionStatus: 'PURGED' }),
      BillModel.countDocuments({ retentionUntil: { $gt: now }, retentionStatus: 'ACTIVE' }),
      BillModel.countDocuments({ retentionUntil: { $lte: now }, retentionStatus: { $ne: 'PURGED' } }),
    ]);

    return {
      claims: {
        activeStatutory5Year: activeStatutoryClaims,
        eligibleForPurge: expiredClaims,
        purged: purgedClaims,
      },
      bills: {
        active: activeBills,
        eligibleForPurge: expiredBills,
      },
      statutoryStandard: '5_YEARS_INCOME_TAX_ACT_SEC_44AA',
    };
  },
};
