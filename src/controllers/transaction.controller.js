import { TransactionModel } from '../models/transaction.model.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const transactions = await TransactionModel.find({ userId })
      .sort({ date: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await TransactionModel.countDocuments({ userId });

    return ApiResponse.success(res, 'Transactions fetched successfully', {
      transactions,
      total,
      limit,
      skip,
    });
  } catch (error) {
    next(error);
  }
};

export const createTransaction = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { title, amount, type, category, paidVia, isReimbursable, note, date } = req.body;

    if (!title || !title.trim()) {
      return ApiResponse.error(res, 'Transaction title is required', 400);
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return ApiResponse.error(res, 'Valid transaction amount is required', 400);
    }
    if (!type || !['income', 'expense'].includes(type)) {
      return ApiResponse.error(res, 'Transaction type must be "income" or "expense"', 400);
    }

    const tx = await TransactionModel.create({
      userId,
      title: title.trim(),
      amount: Number(amount),
      type,
      category: category || 'Uncategorized',
      paidVia: paidVia || 'UPI',
      isReimbursable: Boolean(isReimbursable),
      note: note || '',
      date: date ? new Date(date) : new Date(),
    });

    return ApiResponse.success(res, 'Transaction created successfully', tx.toObject(), 201);
  } catch (error) {
    next(error);
  }
};

export const deleteTransaction = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const tx = await TransactionModel.findOne({ _id: id, userId });
    if (!tx) {
      return ApiResponse.error(res, 'Transaction not found or access denied', 404);
    }

    await TransactionModel.findByIdAndDelete(id);
    return ApiResponse.success(res, 'Transaction deleted successfully');
  } catch (error) {
    next(error);
  }
};

