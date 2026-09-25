import { TransactionModel } from '../models/transaction.model.js';
import { CategoryRuleModel } from '../models/categoryRule.model.js';

export const categorizationService = {
  /**
   * Apply learned smart categorization rule for a given merchant string
   */
  applySmartCategorization: async (userId, rawTitle, defaultCategory = 'Uncategorized') => {
    if (!rawTitle) {
      return defaultCategory;
    }
    const cleanPattern = rawTitle.trim().toLowerCase();

    // Check user-learned category rules
    const rules = await CategoryRuleModel.find({ userId }).lean().catch(() => []);
    for (const rule of rules) {
      if (cleanPattern.includes(rule.merchantPattern)) {
        return rule.category;
      }
    }

    return defaultCategory;
  },

  /**
   * SCRUM-190 & SCRUM-191:
   * Recategorize a transaction, record user feedback, and refine future categorization rules
   */
  recategorizeTransaction: async ({ userId, transactionId, newCategory, applyToFuture = true }) => {
    // 1. Find and update target transaction
    const txn = await TransactionModel.findOne({ _id: transactionId, userId });
    if (!txn) {
      throw new Error('Transaction not found or access denied');
    }

    const previousCategory = txn.category;
    txn.category = newCategory;
    await txn.save();

    // 2. Extract normalized merchant pattern from transaction title
    const merchantPattern = (txn.title || '').trim().toLowerCase();

    // 3. Save/Upsert learned user correction rule (SCRUM-191)
    if (merchantPattern && applyToFuture) {
      await CategoryRuleModel.findOneAndUpdate(
        { userId, merchantPattern },
        {
          $set: {
            category: newCategory,
            userCreated: true,
            createdAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      // Also retroactively update other transactions matching this exact merchant title that still have default/previous category
      await TransactionModel.updateMany(
        {
          userId,
          title: { $regex: new RegExp(merchantPattern, 'i') },
          category: previousCategory,
        },
        { $set: { category: newCategory } }
      );
    }

    return {
      transaction: txn.toObject(),
      merchantPattern,
      previousCategory,
      newCategory,
      message: `Updated category to "${newCategory}" and learned rule for "${merchantPattern}".`,
    };
  },
};
