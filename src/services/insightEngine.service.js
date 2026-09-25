import { TransactionModel } from '../models/transaction.model.js';
import { NudgeModel } from '../models/nudge.model.js';

export const insightEngineService = {
  /**
   * SCRUM-176: Detect unusual spend spikes for a user across categories
   */
  detectSpendSpikes: async (userId) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [currentTxns, prevTxns] = await Promise.all([
      TransactionModel.find({ userId, type: 'expense', date: { $gte: startOfMonth } }).lean(),
      TransactionModel.find({ userId, type: 'expense', date: { $gte: startOfPrevMonth, $lt: startOfMonth } }).lean(),
    ]);

    // Aggregate category totals for current and previous month
    const currentTotals = {};
    currentTxns.forEach((t) => {
      const cat = t.category || 'General';
      currentTotals[cat] = (currentTotals[cat] || 0) + (t.amount || 0);
    });

    const prevTotals = {};
    prevTxns.forEach((t) => {
      const cat = t.category || 'General';
      prevTotals[cat] = (prevTotals[cat] || 0) + (t.amount || 0);
    });

    const spikes = [];
    for (const [cat, currentAmt] of Object.entries(currentTotals)) {
      const prevAmt = prevTotals[cat] || 1500; // baseline threshold
      // If current spending in category is > 1.4x previous month or exceeds baseline anomaly threshold
      if (currentAmt > 1.4 * prevAmt && currentAmt >= 2000) {
        const percentIncrease = Math.round(((currentAmt - prevAmt) / prevAmt) * 100);
        spikes.push({
          type: 'SPIKE',
          category: cat,
          amount: currentAmt,
          title: `Unusual Spend Spike in ${cat}`,
          message: `Your spending in ${cat} reached ₹${currentAmt.toLocaleString('en-IN')} (+${percentIncrease}% MoM).`,
          actionText: `Review ${cat} Transactions`,
        });
      }
    }

    return spikes;
  },

  /**
   * SCRUM-177: Detect upcoming subscription renewals based on historical recurring merchant transactions
   */
  detectSubscriptionRenewals: async (userId) => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const txns = await TransactionModel.find({
      userId,
      type: 'expense',
      date: { $gte: sixtyDaysAgo },
    })
      .sort({ date: -1 })
      .lean();

    // Group transactions by title/merchant keyword
    const merchantGroups = {};
    txns.forEach((t) => {
      const titleKey = (t.title || '').trim().toLowerCase();
      if (titleKey) {
        if (!merchantGroups[titleKey]) {
          merchantGroups[titleKey] = [];
        }
        merchantGroups[titleKey].push(t);
      }
    });

    const renewals = [];
    const subscriptionKeywords = ['netflix', 'spotify', 'gym', 'youtube', 'prime', 'adobe', 'apple', 'icloud'];

    for (const [merchant, group] of Object.entries(merchantGroups)) {
      const isKnownSub = subscriptionKeywords.some((kw) => merchant.includes(kw));
      if (group.length >= 1 && (isKnownSub || group.length >= 2)) {
        const latestTxn = group[0];
        const lastDate = new Date(latestTxn.date);
        const daysSinceLast = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        // If transaction occurred roughly 25-30 days ago, flag upcoming renewal in 2-3 days
        if (daysSinceLast >= 25 && daysSinceLast <= 32) {
          const formattedTitle = latestTxn.title || merchant.toUpperCase();
          renewals.push({
            type: 'SUBSCRIPTION',
            category: latestTxn.category || 'Subscriptions',
            amount: latestTxn.amount || 0,
            title: `Upcoming Renewal: ${formattedTitle}`,
            message: `${formattedTitle} subscription of ₹${(latestTxn.amount || 0).toLocaleString('en-IN')} is scheduled for auto-debit in 3 days.`,
            actionText: 'Manage Mandate',
          });
        }
      }
    }

    return renewals;
  },

  /**
   * SCRUM-178: Implement savings-tip generation logic based on user spending velocity and budgets
   */
  generateSavingsTips: async (userId) => {
    const txns = await TransactionModel.find({ userId, type: 'expense' }).lean();

    const diningSpend = txns
      .filter((t) => ['Food & Dining', 'Food', 'Dining'].includes(t.category))
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    const tips = [];
    if (diningSpend > 2500) {
      tips.push({
        type: 'SAVINGS',
        category: 'Food & Dining',
        amount: Math.round(diningSpend * 0.3),
        title: 'Smart Savings Tip: Dining Out',
        message: `Cutting weekend food delivery by 2 orders can help you save approx ₹${Math.round(diningSpend * 0.3).toLocaleString('en-IN')} this month.`,
        actionText: 'Set Dining Limit',
      });
    } else {
      tips.push({
        type: 'SAVINGS',
        category: 'General',
        amount: 1500,
        title: 'Smart Savings Tip: Monthly Buffer',
        message: `You are on pace to save ₹1,500 more this month compared to your monthly budget target.`,
        actionText: 'Transfer to Savings Goal',
      });
    }

    return tips;
  },

  /**
   * SCRUM-179: Generate, persist, and fetch active in-app nudges
   */
  getProactiveNudges: async (userId) => {
    // 1. Check existing unread nudges in DB
    const existingNudges = await NudgeModel.find({ userId, dismissed: false }).sort({ createdAt: -1 }).lean();

    if (existingNudges.length > 0) {
      return existingNudges;
    }

    // 2. Generate new proactive nudges if DB has none
    const [spikes, renewals, tips] = await Promise.all([
      insightEngineService.detectSpendSpikes(userId),
      insightEngineService.detectSubscriptionRenewals(userId),
      insightEngineService.generateSavingsTips(userId),
    ]);

    const generated = [...spikes, ...renewals, ...tips];
    const savedNudges = [];

    for (const item of generated) {
      const nudgeDoc = await NudgeModel.create({
        userId,
        type: item.type,
        title: item.title,
        message: item.message,
        amount: item.amount,
        category: item.category,
        actionText: item.actionText,
      });
      savedNudges.push(nudgeDoc.toObject());
    }

    return savedNudges;
  },

  /**
   * Dismiss a specific nudge
   */
  dismissNudge: async (userId, nudgeId) => {
    return NudgeModel.findOneAndUpdate(
      { _id: nudgeId, userId },
      { $set: { dismissed: true, read: true } },
      { returnDocument: 'after' }
    );
  },
};
