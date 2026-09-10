import { ApiResponse } from '../utils/apiResponse.js';

export const getTransactions = async (req, res, next) => {
  try {
    const mockTransactions = [
      { id: '1', title: 'Groceries', amount: 45.5, type: 'expense', category: 'Food', date: new Date() },
      { id: '2', title: 'Salary', amount: 2500, type: 'income', category: 'Paycheck', date: new Date() },
    ];
    return ApiResponse.success(res, 'Transactions fetched successfully', mockTransactions);
  } catch (error) {
    next(error);
  }
};

export const createTransaction = async (req, res, next) => {
  try {
    const { title, amount, type, category } = req.body;
    const newTransaction = {
      id: String(Date.now()),
      title,
      amount,
      type,
      category,
      date: new Date(),
    };
    return ApiResponse.success(res, 'Transaction created successfully', newTransaction, 201);
  } catch (error) {
    next(error);
  }
};
