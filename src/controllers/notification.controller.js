import { Notification } from '../models/notification.model.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'usr_me';
    const userPhone = req.user?.phone || '';
    const cleanPhone = userPhone ? userPhone.replace(/\D/g, '').slice(-10) : '';

    const conditions = [{ userId }];
    if (cleanPhone) {
      conditions.push({ 'data.targetPhone': { $regex: cleanPhone + '$' } });
    }

    const notifications = await Notification.find({
      $or: conditions,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return ApiResponse.success(res, 'Notifications fetched successfully', notifications);
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return ApiResponse.error(res, 'Notification not found', 404);
    }
    return ApiResponse.success(res, 'Notification marked as read', notification);
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'usr_me';
    await Notification.updateMany({ userId, isRead: false }, { isRead: true });
    return ApiResponse.success(res, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
};

export const updateActionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'ACCEPTED' or 'DECLINED'

    const notification = await Notification.findByIdAndUpdate(
      id,
      { actionStatus: action, isRead: true },
      { new: true }
    );
    if (!notification) {
      return ApiResponse.error(res, 'Notification not found', 404);
    }
    return ApiResponse.success(res, 'Notification action updated', notification);
  } catch (error) {
    next(error);
  }
};

export const createNotification = async (req, res, next) => {
  try {
    const { userId, title, body, type, data } = req.body;
    const targetUserId = userId || req.user?.id || 'usr_me';

    if (!title || !body) {
      return ApiResponse.error(res, 'Title and body are required', 400);
    }

    const notification = await Notification.create({
      userId: targetUserId,
      title,
      body,
      type: type || 'system',
      data: data || {},
    });

    return ApiResponse.success(res, 'Notification created successfully', notification, 201);
  } catch (error) {
    next(error);
  }
};
