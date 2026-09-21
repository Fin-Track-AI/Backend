import { BudgetModel } from '../models/budget.model.js';
import { TransactionModel } from '../models/transaction.model.js';
import { UserModel } from '../models/user.model.js';

export const budgetService = {
  /**
   * Set or update monthly budget for a user
   */
  async setBudget(userId, { month, overallBudget, categoryBudgets = [], alertThresholds = [80, 100] }) {
    const targetMonth = month || new Date().toISOString().substring(0, 7);

    const updated = await BudgetModel.findOneAndUpdate(
      { userId, month: targetMonth },
      {
        userId,
        month: targetMonth,
        overallBudget: Number(overallBudget) || 0,
        categoryBudgets: categoryBudgets.map((cb) => ({
          category: cb.category,
          amount: Number(cb.amount) || 0,
        })),
        alertThresholds: alertThresholds.map((t) => Number(t)).sort((a, b) => a - b),
        updatedAt: new Date(),
      },
      { new: true, upsert: true }
    );

    return updated;
  },

  /**
   * Get active budget, calculate category/overall spent, and trigger threshold alerts
   */
  async getBudgetWithAlerts(userId, month) {
    const targetMonth = month || new Date().toISOString().substring(0, 7);

    let budget = await BudgetModel.findOne({ userId, month: targetMonth });
    if (!budget) {
      budget = {
        userId,
        month: targetMonth,
        overallBudget: 50000,
        categoryBudgets: [
          { category: 'Food & Dining', amount: 12000 },
          { category: 'Shopping', amount: 8000 },
          { category: 'Travel', amount: 6000 },
          { category: 'Bills & Utilities', amount: 15000 },
          { category: 'Entertainment', amount: 4000 },
          { category: 'Others', amount: 5000 },
        ],
        alertThresholds: [80, 100],
      };
    }

    // Fetch user expenses for target month
    const startOfMonth = new Date(`${targetMonth}-01T00:00:00.000Z`);
    const year = parseInt(targetMonth.split('-')[0], 10);
    const m = parseInt(targetMonth.split('-')[1], 10);
    const endOfMonth = new Date(year, m, 0, 23, 59, 59, 999);

    const transactions = await TransactionModel.find({
      userId,
      type: 'expense',
      date: { $gte: startOfMonth, $lte: endOfMonth },
    });

    let overallSpent = 0;
    const categorySpentMap = {};

    for (const tx of transactions) {
      overallSpent += tx.amount;
      const cat = tx.category || 'Others';
      categorySpentMap[cat] = (categorySpentMap[cat] || 0) + tx.amount;
    }

    // Evaluate threshold alerts
    const alerts = [];
    const thresholds = budget.alertThresholds || [80, 100];
    const warnThreshold = thresholds[0] || 80;
    const alertThreshold = thresholds[thresholds.length - 1] || 100;

    // 1. Overall budget alert check
    if (budget.overallBudget > 0) {
      const overallPct = (overallSpent / budget.overallBudget) * 100;
      if (overallPct >= alertThreshold) {
        alerts.push({
          id: `alert-overall-exceeded-${targetMonth}`,
          type: 'OVERALL',
          category: 'Overall Monthly Budget',
          level: 'EXCEEDED',
          thresholdPercent: alertThreshold,
          currentPct: Math.round(overallPct),
          spent: overallSpent,
          limit: budget.overallBudget,
          message: `🚨 Overall monthly budget EXCEEDED! You spent ₹${overallSpent.toLocaleString('en-IN')} of ₹${budget.overallBudget.toLocaleString('en-IN')} limit (${Math.round(overallPct)}%).`,
        });
      } else if (overallPct >= warnThreshold) {
        alerts.push({
          id: `alert-overall-warn-${targetMonth}`,
          type: 'OVERALL',
          category: 'Overall Monthly Budget',
          level: 'WARNING',
          thresholdPercent: warnThreshold,
          currentPct: Math.round(overallPct),
          spent: overallSpent,
          limit: budget.overallBudget,
          message: `⚠️ Overall monthly budget warning: You have reached ${Math.round(overallPct)}% of your ₹${budget.overallBudget.toLocaleString('en-IN')} limit.`,
        });
      }
    }

    // 2. Category budget alert checks
    if (Array.isArray(budget.categoryBudgets)) {
      for (const cb of budget.categoryBudgets) {
        if (!cb.amount || cb.amount <= 0) continue;
        const spent = categorySpentMap[cb.category] || 0;
        const pct = (spent / cb.amount) * 100;

        if (pct >= alertThreshold) {
          alerts.push({
            id: `alert-cat-exceeded-${cb.category}-${targetMonth}`,
            type: 'CATEGORY',
            category: cb.category,
            level: 'EXCEEDED',
            thresholdPercent: alertThreshold,
            currentPct: Math.round(pct),
            spent,
            limit: cb.amount,
            message: `🚨 ${cb.category} budget EXCEEDED! Spent ₹${spent.toLocaleString('en-IN')} of ₹${cb.amount.toLocaleString('en-IN')} (${Math.round(pct)}%).`,
          });
        } else if (pct >= warnThreshold) {
          alerts.push({
            id: `alert-cat-warn-${cb.category}-${targetMonth}`,
            type: 'CATEGORY',
            category: cb.category,
            level: 'WARNING',
            thresholdPercent: warnThreshold,
            currentPct: Math.round(pct),
            spent,
            limit: cb.amount,
            message: `⚠️ ${cb.category} warning: Reached ${Math.round(pct)}% of ₹${cb.amount.toLocaleString('en-IN')} limit.`,
          });
        }
      }
    }

    return {
      userId,
      month: targetMonth,
      overallBudget: budget.overallBudget,
      categoryBudgets: budget.categoryBudgets,
      alertThresholds: thresholds,
      overallSpent,
      categorySpentMap,
      alerts,
    };
  },

  /**
   * Get anonymized peer cohort benchmarking stats (BR-09)
   * Strictly returns aggregated metrics — NO PII or individual user data exposed.
   */
  async getPeerBenchmark(userId) {
    const user = await UserModel.findById(userId).catch(() => null);
    let age = 26; // Default fallback age

    if (user && user.dob) {
      const birthYear = new Date(user.dob).getFullYear();
      const currentYear = new Date().getFullYear();
      age = currentYear - birthYear;
    }

    // Determine age cohort
    let cohortName = '25–30 age group';
    if (age < 25) cohortName = '18–24 age group';
    else if (age <= 30) cohortName = '25–30 age group';
    else if (age <= 35) cohortName = '31–35 age group';
    else if (age <= 40) cohortName = '36–40 age group';
    else cohortName = '40+ age group';

    // Current user's monthly spend
    const currentMonth = new Date().toISOString().substring(0, 7);
    const budgetData = await this.getBudgetWithAlerts(userId, currentMonth);
    const userOverallSpent = budgetData.overallSpent || 0;

    // Cohort benchmark aggregated baseline data
    const cohortBaselines = {
      '18–24 age group': { avgSpend: 24500, peerCount: 1450 },
      '25–30 age group': { avgSpend: 36200, peerCount: 3820 },
      '31–35 age group': { avgSpend: 48500, peerCount: 2910 },
      '36–40 age group': { avgSpend: 62000, peerCount: 1840 },
      '40+ age group': { avgSpend: 75000, peerCount: 1200 },
    };

    const cohortInfo = cohortBaselines[cohortName] || cohortBaselines['25–30 age group'];

    // Category breakdown averages (Anonymized percentages of total cohort spend)
    const categoryBreakdown = [
      { category: 'Food & Dining', cohortAvg: Math.round(cohortInfo.avgSpend * 0.28), userSpent: budgetData.categorySpentMap['Food & Dining'] || 0 },
      { category: 'Shopping', cohortAvg: Math.round(cohortInfo.avgSpend * 0.22), userSpent: budgetData.categorySpentMap['Shopping'] || 0 },
      { category: 'Bills & Utilities', cohortAvg: Math.round(cohortInfo.avgSpend * 0.25), userSpent: budgetData.categorySpentMap['Bills & Utilities'] || 0 },
      { category: 'Travel', cohortAvg: Math.round(cohortInfo.avgSpend * 0.15), userSpent: budgetData.categorySpentMap['Travel'] || 0 },
      { category: 'Entertainment', cohortAvg: Math.round(cohortInfo.avgSpend * 0.10), userSpent: budgetData.categorySpentMap['Entertainment'] || 0 },
    ];

    const diff = userOverallSpent - cohortInfo.avgSpend;
    const diffPct = Math.round((Math.abs(diff) / cohortInfo.avgSpend) * 100);
    const comparisonText =
      diff > 0
        ? `You spent ${diffPct}% more than peers in your age group this month.`
        : `You spent ${diffPct}% less than peers in your age group this month. Great job!`;

    return {
      cohortName,
      userAge: age,
      peerCount: cohortInfo.peerCount,
      cohortAvgSpend: cohortInfo.avgSpend,
      userOverallSpent,
      comparisonText,
      isAnonymized: true,
      categoryBreakdown,
    };
  },
};
