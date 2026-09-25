import mongoose from 'mongoose';

export const AUDIT_EVENT_TYPES = [
  'DATA_ACCESS',
  'STATE_CHANGE',
  'AUTH_EVENT',
  'CONSENT_UPDATE',
  'CLAIM_MUTATION',
  'SYSTEM_EVENT',
];

const AuditLogSchema = new mongoose.Schema(
  {
    sequence: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    eventType: {
      type: String,
      enum: AUDIT_EVENT_TYPES,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    actor: {
      userId: { type: String, default: 'anonymous', index: true },
      role: { type: String, default: 'USER' },
      email: { type: String, default: '' },
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },
    target: {
      resourceType: { type: String, required: true, index: true },
      resourceId: { type: String, default: '', index: true },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    prevHash: {
      type: String,
      required: true,
    },
    hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Prevent accidental updates to audit log entries to ensure immutability
AuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function () {
  throw new Error('Audit logs are immutable and cannot be updated.');
});

export const AuditLogModel =
  mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
