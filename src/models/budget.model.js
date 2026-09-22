import mongoose from 'mongoose';

const CategoryBudgetSchema = new mongoose.Schema({
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
});

const BudgetSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  month: { type: String, required: true, index: true }, // Format: YYYY-MM
  overallBudget: { type: Number, required: true, default: 0, min: 0 },
  categoryBudgets: { type: [CategoryBudgetSchema], default: [] },
  alertThresholds: { type: [Number], default: [80, 100] }, // Percentages e.g. 80%, 100%
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Composite index for fast query per user per month
BudgetSchema.index({ userId: 1, month: 1 }, { unique: true });

export const BudgetModel =
  mongoose.models.Budget || mongoose.model('Budget', BudgetSchema);
