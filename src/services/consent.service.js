import { ConsentModel } from '../models/consent.model.js';

const DEFAULT_CONSENTS = {
  upiConsent: false,
  billStorageConsent: false,
  aiUsageConsent: false,
};

export const consentService = {
  /**
   * Get current consents for a user (creates default record if none exists).
   */
  getUserConsents: async (userId) => {
    let record = await ConsentModel.findOne({ userId }).lean();
    if (!record) {
      const created = await ConsentModel.create({
        userId,
        consents: { ...DEFAULT_CONSENTS },
        history: [],
        updatedAt: new Date(),
      });
      record = created.toObject();
    }
    return record;
  },

  /**
   * Update (grant or revoke) user consents.
   */
  updateConsents: async (userId, newConsents) => {
    const currentRecord = await consentService.getUserConsents(userId);
    const updatedConsents = { ...currentRecord.consents };
    const historyEntries = [];
    const timestamp = new Date();

    for (const key of ['upiConsent', 'billStorageConsent', 'aiUsageConsent']) {
      if (typeof newConsents[key] === 'boolean' && newConsents[key] !== updatedConsents[key]) {
        updatedConsents[key] = newConsents[key];
        historyEntries.push({
          consentType: key,
          status: newConsents[key] ? 'GRANTED' : 'REVOKED',
          timestamp,
        });
      }
    }

    const updatedRecord = await ConsentModel.findOneAndUpdate(
      { userId },
      {
        $set: { consents: updatedConsents, updatedAt: timestamp },
        $push: { history: { $each: historyEntries } },
      },
      { returnDocument: 'after', upsert: true }
    );

    return updatedRecord;
  },

  /**
   * Revoke a specific consent type.
   */
  revokeConsent: async (userId, consentType) => {
    const keyMap = {
      upi: 'upiConsent',
      upiConsent: 'upiConsent',
      billStorage: 'billStorageConsent',
      billStorageConsent: 'billStorageConsent',
      aiUsage: 'aiUsageConsent',
      aiUsageConsent: 'aiUsageConsent',
    };

    const targetKey = keyMap[consentType];
    if (!targetKey) {
      const error = new Error(
        `Invalid consent type: ${consentType}. Valid types: upi, billStorage, aiUsage`
      );
      error.statusCode = 400;
      error.code = 'INVALID_CONSENT_TYPE';
      throw error;
    }

    return await consentService.updateConsents(userId, { [targetKey]: false });
  },

  /**
   * Check if a specific consent is currently active for a user.
   */
  hasConsent: async (userId, consentType) => {
    const record = await consentService.getUserConsents(userId);
    return Boolean(record.consents[consentType]);
  },

  /**
   * Helper to clear store for testing — deletes test user docs.
   */
  _clearStore: async () => {
    await ConsentModel.deleteMany({ userId: 'user_123' });
  },
};

