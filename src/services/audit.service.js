import crypto from 'crypto';
import mongoose from 'mongoose';
import { AuditLogModel } from '../models/auditLog.model.js';
import { sanitizeAuditData } from '../utils/auditSanitizer.js';

export const GENESIS_HASH = '0'.repeat(64);

/**
 * Produces a canonical string representation of an audit entry for deterministic hashing.
 */
function canonicalize(data) {
  if (data === null || data === undefined) {
    return '';
  }
  if (typeof data !== 'object') {
    return String(data);
  }
  if (Array.isArray(data)) {
    return `[${data.map(canonicalize).join(',')}]`;
  }
  const keys = Object.keys(data).sort();
  return `{${keys.map((k) => `"${k}":${canonicalize(data[k])}`).join(',')}}`;
}

/**
 * Computes deterministic SHA-256 hash for an audit log entry.
 */
export function computeAuditHash({
  sequence,
  timestamp,
  eventType,
  action,
  actor,
  target,
  metadata,
  prevHash,
}) {
  const tsString = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();

  const canonicalPayload = [
    `seq:${sequence}`,
    `ts:${tsString}`,
    `type:${eventType}`,
    `action:${action}`,
    `actor:${canonicalize(actor || {})}`,
    `target:${canonicalize(target || {})}`,
    `meta:${canonicalize(metadata || {})}`,
    `prev:${prevHash}`,
  ].join('|');

  return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}

export const auditService = {
  /**
   * Log an audit event with cryptographic tamper-evident chaining.
   */
  logEvent: async ({
    eventType,
    action,
    actor = {},
    target = {},
    metadata = {},
  }, maxRetries = 3) => {
    // Guard against operations when MongoDB is not connected (e.g. during test setup/teardown)
    if (mongoose.connection.readyState !== 1) {
      return null;
    }
    const cleanMetadata = sanitizeAuditData(metadata);
    const cleanActor = {
      userId: actor.userId || actor.id || 'anonymous',
      role: actor.role || 'USER',
      email: actor.email || '',
      ip: actor.ip || '',
      userAgent: actor.userAgent || '',
    };
    const cleanTarget = {
      resourceType: target.resourceType || 'SYSTEM',
      resourceId: String(target.resourceId || ''),
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Query latest audit entry to link the hash chain
        const latestEntry = await AuditLogModel.findOne({})
          .sort({ sequence: -1 })
          .select('sequence hash')
          .lean();

        const sequence = latestEntry ? latestEntry.sequence + 1 : 1;
        const prevHash = latestEntry ? latestEntry.hash : GENESIS_HASH;
        const timestamp = new Date();

        const hash = computeAuditHash({
          sequence,
          timestamp,
          eventType,
          action,
          actor: cleanActor,
          target: cleanTarget,
          metadata: cleanMetadata,
          prevHash,
        });

        const newLog = await AuditLogModel.create({
          sequence,
          timestamp,
          eventType,
          action,
          actor: cleanActor,
          target: cleanTarget,
          metadata: cleanMetadata,
          prevHash,
          hash,
        });

        return newLog;
      } catch (err) {
        // If race condition on sequence uniqueness, retry with jitter
        const isDuplicateKey =
          err.code === 11000 ||
          (err.message && err.message.includes('E11000')) ||
          (err.name && err.name.includes('MongoServerError'));

        if (isDuplicateKey && attempt < maxRetries - 1) {
          const delay = Math.floor(Math.random() * 40) + (attempt + 1) * 30;
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }
        console.error('[AuditService Error]: Failed to create audit log:', err.message);
        throw err;
      }
    }
  },

  /**
   * Log a state-changing event (SCRUM-164).
   */
  logStateChange: async ({ action, actor, target, metadata }) => {
    return auditService.logEvent({
      eventType: 'STATE_CHANGE',
      action,
      actor,
      target,
      metadata,
    });
  },

  /**
   * Log a sensitive data access event (SCRUM-165).
   * Runs non-blockingly when called from middleware.
   */
  logDataAccess: async ({ action, actor, target, metadata }) => {
    return auditService.logEvent({
      eventType: 'DATA_ACCESS',
      action,
      actor,
      target,
      metadata,
    });
  },

  /**
   * Log claim mutation event (SCRUM-164).
   */
  logClaimMutation: async ({ action, actor, target, metadata }) => {
    return auditService.logEvent({
      eventType: 'CLAIM_MUTATION',
      action,
      actor,
      target,
      metadata,
    });
  },

  /**
   * Verify the integrity of the cryptographic audit chain (SCRUM-166).
   * Detects modified documents, deleted entries, or broken sequence links.
   */
  verifyAuditChain: async ({ fromSequence = 1, toSequence = null } = {}) => {
    const query = { sequence: { $gte: fromSequence } };
    if (toSequence !== null) {
      query.sequence.$lte = toSequence;
    }

    const logs = await AuditLogModel.find(query).sort({ sequence: 1 }).lean();

    if (logs.length === 0) {
      return {
        isValid: true,
        totalChecked: 0,
        message: 'No audit logs found in the specified sequence range.',
      };
    }

    let previousLog = null;
    if (fromSequence > 1) {
      previousLog = await AuditLogModel.findOne({ sequence: fromSequence - 1 }).lean();
    }

    for (let i = 0; i < logs.length; i++) {
      const current = logs[i];

      // 1. Check Genesis Block or Chain Link to Previous Hash
      if (current.sequence === 1) {
        if (current.prevHash !== GENESIS_HASH) {
          return {
            isValid: false,
            totalChecked: i,
            error: {
              sequence: current.sequence,
              type: 'GENESIS_MISMATCH',
              details: `Genesis record sequence 1 must have prevHash equal to GENESIS_HASH. Found: ${current.prevHash}`,
            },
          };
        }
      } else if (previousLog) {
        if (current.prevHash !== previousLog.hash) {
          return {
            isValid: false,
            totalChecked: i,
            error: {
              sequence: current.sequence,
              type: 'CHAIN_BROKEN',
              details: `Chain broken between sequence ${previousLog.sequence} and ${current.sequence}. Expected prevHash ${previousLog.hash}, but record has ${current.prevHash}`,
              expectedPrevHash: previousLog.hash,
              actualPrevHash: current.prevHash,
            },
          };
        }

        if (current.sequence !== previousLog.sequence + 1) {
          return {
            isValid: false,
            totalChecked: i,
            error: {
              sequence: current.sequence,
              type: 'SEQUENCE_GAP',
              details: `Missing sequence gap detected between ${previousLog.sequence} and ${current.sequence}. Log entry may have been deleted.`,
            },
          };
        }
      }

      // 2. Recompute and verify the document's own SHA-256 hash
      const expectedHash = computeAuditHash({
        sequence: current.sequence,
        timestamp: current.timestamp,
        eventType: current.eventType,
        action: current.action,
        actor: current.actor,
        target: current.target,
        metadata: current.metadata,
        prevHash: current.prevHash,
      });

      if (expectedHash !== current.hash) {
        return {
          isValid: false,
          totalChecked: i,
          error: {
            sequence: current.sequence,
            type: 'HASH_MISMATCH',
            details: `Tamper detected at sequence ${current.sequence}! Data content or metadata has been altered.`,
            expectedHash,
            actualHash: current.hash,
          },
        };
      }

      previousLog = current;
    }

    return {
      isValid: true,
      totalChecked: logs.length,
      verifiedRange: {
        start: logs[0].sequence,
        end: logs[logs.length - 1].sequence,
      },
    };
  },

  /**
   * Query filtered, paginated audit logs.
   */
  getAuditLogs: async ({
    page = 1,
    limit = 50,
    eventType,
    action,
    userId,
    resourceType,
    resourceId,
  } = {}) => {
    const filter = {};
    if (eventType) {
      filter.eventType = eventType;
    }
    if (action) {
      filter.action = action;
    }
    if (userId) {
      filter['actor.userId'] = userId;
    }
    if (resourceType) {
      filter['target.resourceType'] = resourceType;
    }
    if (resourceId) {
      filter['target.resourceId'] = resourceId;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ sequence: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};
