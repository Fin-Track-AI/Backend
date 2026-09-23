import { splitService } from '../services/split.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const createGroup = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'usr_me';
    const { title, icon, members } = req.body;

    if (!title) {
      return ApiResponse.error(res, 'Group title is required', 400);
    }

    if (!members || members.length < 2) {
      return ApiResponse.error(res, 'Please add at least 2 members to create a split group', 400);
    }

    const group = await splitService.createGroup({
      title,
      icon,
      members,
      createdBy: userId,
    });

    return ApiResponse.success(res, 'Split group created successfully', group, 201);
  } catch (error) {
    return ApiResponse.error(res, error.message, 400);
  }
};

export const getGroups = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'usr_me';
    const userPhone = req.query.phone || req.user?.phone || '';
    const groups = await splitService.getGroupsByUser(userId, userPhone);
    return ApiResponse.success(res, 'Groups fetched successfully', groups);
  } catch (error) {
    next(error);
  }
};

export const getGroupById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const group = await splitService.getGroupById(id);
    return ApiResponse.success(res, 'Group details fetched successfully', group);
  } catch (error) {
    next(error);
  }
};

export const deleteGroup = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 'usr_me';
    const result = await splitService.deleteGroup(id, userId);
    return ApiResponse.success(res, 'Group deleted successfully', result);
  } catch (error) {
    return ApiResponse.error(res, error.message, error.message === 'Group not found' ? 404 : 400);
  }
};

export const lookupUserByPhone = async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return ApiResponse.error(res, 'Mobile number is required', 400);
    }

    const user = await splitService.lookupUserByPhone(phone);
    if (!user) {
      return ApiResponse.error(
        res,
        'This person is not available on FinTrack. Please check the mobile number or invite them to join FinTrack.',
        404,
        { exists: false }
      );
    }

    return ApiResponse.success(res, 'User found on FinTrack', { exists: true, user });
  } catch (error) {
    return ApiResponse.error(res, error.message, 400);
  }
};

export const respondToInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const userId = req.user?.id || 'usr_me';
    const userPhone = req.user?.phone || '';

    const group = await splitService.respondToInvitation(id, userId, userPhone, action);
    return ApiResponse.success(
      res,
      action === 'ACCEPT' ? 'Group invitation accepted' : 'Group invitation declined',
      group
    );
  } catch (error) {
    return ApiResponse.error(res, error.message, 400);
  }
};

export const getInvitations = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'usr_me';
    const userPhone = req.query.phone || req.user?.phone || '';

    const invitations = await splitService.getUserInvitations(userId, userPhone);
    return ApiResponse.success(res, 'Invitations fetched successfully', invitations);
  } catch (error) {
    next(error);
  }
};

export const addMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { memberId, name, phone, avatarUrl } = req.body;

    if (!name) {
      return ApiResponse.error(res, 'Member name is required', 400);
    }

    const group = await splitService.addMemberToGroup(id, {
      memberId: memberId || `mem_${Date.now()}`,
      name,
      phone: phone || '',
      avatarUrl: avatarUrl || '',
    });

    return ApiResponse.success(res, 'Member added successfully to group', group);
  } catch (error) {
    next(error);
  }
};

export const addExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      totalAmount,
      paidByMemberId,
      splitType,
      allocations,
      category,
      notes,
      itemizedEntries,
      percentages,
      members,
      taxAndTip,
    } = req.body;

    if (!title || !totalAmount || Number(totalAmount) <= 0) {
      return ApiResponse.error(res, 'Valid title and totalAmount are required', 400);
    }

    let calculatedAllocations = allocations;

    // If caller wants backend to calculate split allocations:
    if (!calculatedAllocations || calculatedAllocations.length === 0) {
      const group = await splitService.getGroupById(id);
      const targetMembers = members || group.members;

      if (splitType === 'equal') {
        calculatedAllocations = splitService.calculateEqualSplit({
          totalAmount: Number(totalAmount),
          members: targetMembers,
        });
      } else if (splitType === 'percentage') {
        calculatedAllocations = splitService.calculatePercentageSplit({
          totalAmount: Number(totalAmount),
          members: targetMembers,
          percentages: percentages || {},
        });
      } else if (splitType === 'itemized') {
        calculatedAllocations = splitService.calculateItemizedSplit({
          totalAmount: Number(totalAmount),
          items: itemizedEntries || [],
          members: targetMembers,
          taxAndTip: taxAndTip || 0,
        });
      } else {
        return ApiResponse.error(
          res,
          'Invalid splitType. Must be equal, percentage, or itemized',
          400
        );
      }
    }

    const expense = await splitService.addExpense({
      groupId: id,
      title,
      totalAmount: Number(totalAmount),
      paidByMemberId,
      splitType,
      allocations: calculatedAllocations,
      category,
      notes,
      itemizedEntries,
    });

    return ApiResponse.success(
      res,
      'Group expense added and reconciled to 100%',
      expense,
      201
    );
  } catch (error) {
    next(error);
  }
};

export const getGroupExpenses = async (req, res, next) => {
  try {
    const { id } = req.params;
    const expenses = await splitService.getExpensesByGroupId(id);
    return ApiResponse.success(res, 'Group expenses fetched successfully', expenses);
  } catch (error) {
    next(error);
  }
};

export const getGroupBalances = async (req, res, next) => {
  try {
    const { id } = req.params;
    const balances = await splitService.getGroupBalancesAndSimplifiedDebts(id);
    return ApiResponse.success(res, 'Group balances and simplified debts calculated', balances);
  } catch (error) {
    next(error);
  }
};

export const markSettlement = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'usr_me';
    const {
      groupId,
      debtKey,
      fromMemberId,
      fromMemberName,
      toMemberId,
      toMemberName,
      amount,
      settlementNote,
    } = req.body;

    if (!groupId || !debtKey || !amount) {
      return ApiResponse.error(res, 'groupId, debtKey, and amount are required', 400);
    }

    const settlement = await splitService.markSettlement({
      groupId,
      debtKey,
      fromMemberId,
      fromMemberName,
      toMemberId,
      toMemberName,
      amount: Number(amount),
      settlementNote,
      userId,
    });

    return ApiResponse.success(
      res,
      'Settlement recorded successfully (Non-monetary ledger update)',
      settlement
    );
  } catch (error) {
    next(error);
  }
};

export const getGroupSettlements = async (req, res, next) => {
  try {
    const { id } = req.params;
    const settlements = await splitService.getSettlementsByGroupId(id);
    return ApiResponse.success(res, 'Group settlements fetched successfully', settlements);
  } catch (error) {
    next(error);
  }
};

export const revertSettlement = async (req, res, next) => {
  try {
    const { debtKey } = req.params;
    const result = await splitService.revertSettlement(debtKey);
    return ApiResponse.success(res, 'Settlement reverted successfully', result);
  } catch (error) {
    next(error);
  }
};

export const sendReminder = async (req, res, next) => {
  try {
    const {
      groupId,
      debtKey,
      fromMemberId,
      fromMemberName,
      toMemberId,
      toMemberName,
      amount,
      message,
    } = req.body;

    if (!groupId || !amount) {
      return ApiResponse.error(res, 'groupId and amount are required', 400);
    }

    const result = await splitService.sendReminderNotification({
      groupId,
      debtKey,
      fromMemberId,
      fromMemberName,
      toMemberId,
      toMemberName,
      amount: Number(amount),
      message,
    });

    return ApiResponse.success(res, 'Reminder sent successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getReminderMessage = async (req, res, next) => {
  try {
    const { groupTitle, debtorName, amount } = req.query;

    if (!groupTitle || !debtorName || !amount) {
      return ApiResponse.error(
        res,
        'groupTitle, debtorName, and amount query params are required',
        400
      );
    }

    const message = splitService.generateReminderMessage({
      groupTitle,
      debtorName,
      amount: Number(amount),
    });

    return ApiResponse.success(res, 'Reminder copy generated', { message });
  } catch (error) {
    next(error);
  }
};
