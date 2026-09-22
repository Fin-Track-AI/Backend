import { budgetService } from '../services/budget.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const getBudget = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'user_123';
    const month = req.query.month || new Date().toISOString().substring(0, 7);

    const data = await budgetService.getBudgetWithAlerts(userId, month);
    return ApiResponse.success(res, 'Budget fetched successfully', data);
  } catch (error) {
    next(error);
  }
};

export const setBudget = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'user_123';
    const { month, overallBudget, categoryBudgets, alertThresholds } = req.body;

    if (overallBudget !== undefined && (isNaN(Number(overallBudget)) || Number(overallBudget) < 0)) {
      return ApiResponse.error(res, 'Overall budget must be a non-negative number', 400);
    }

    const updated = await budgetService.setBudget(userId, {
      month,
      overallBudget,
      categoryBudgets,
      alertThresholds,
    });

    const fullData = await budgetService.getBudgetWithAlerts(userId, updated.month);
    return ApiResponse.success(res, 'Budget saved successfully', fullData, 200);
  } catch (error) {
    next(error);
  }
};

export const getAlerts = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'user_123';
    const month = req.query.month || new Date().toISOString().substring(0, 7);

    const data = await budgetService.getBudgetWithAlerts(userId, month);
    return ApiResponse.success(res, 'Threshold alerts evaluated successfully', {
      month: data.month,
      alerts: data.alerts,
    });
  } catch (error) {
    next(error);
  }
};

export const getPeerBenchmark = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'user_123';
    const benchmarkData = await budgetService.getPeerBenchmark(userId);

    return ApiResponse.success(res, 'Anonymized peer benchmark fetched successfully', benchmarkData);
  } catch (error) {
    next(error);
  }
};
