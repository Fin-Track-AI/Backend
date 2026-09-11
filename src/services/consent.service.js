/**
 * In-memory storage for user consent settings.
 * Key: userId, Value: Consent Record
 */
const consentStore = new Map();

const DEFAULT_CONSENTS = {
  upiConsent: false,
  billStorageConsent: false,
  aiUsageConsent: false,
};

export const consentService = {
  /**
   * Get current consents for a user.
   */
  getUserConsents: async (userId) => {
    if (!consentStore.has(userId)) {
      const initialRecord = {
        userId,
        consents: { ...DEFAULT_CONSENTS },
        history: [],
        updatedAt: new Date().toISOString(),
      };
      consentStore.set(userId, initialRecord);
    }
    return consentStore.get(userId);
  },

  /**
   * Update (grant or revoke) user consents.
   */
  updateConsents: async (userId, newConsents) => {
    const currentRecord = await consentService.getUserConsents(userId);
    const updatedConsents = { ...currentRecord.consents };
    const historyEntries = [];
    const timestamp = new Date().toISOString();

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

    const updatedRecord = {
      userId,
      consents: updatedConsents,
      history: [...currentRecord.history, ...historyEntries],
      updatedAt: timestamp,
    };

    consentStore.set(userId, updatedRecord);
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
      const error = new Error(`Invalid consent type: ${consentType}. Valid types: upi, billStorage, aiUsage`);
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
   * Helper to clear store for testing
   */
  _clearStore: () => {
    consentStore.clear();
  },
};
