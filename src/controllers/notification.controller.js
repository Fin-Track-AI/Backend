import { Notification } from '../models/notification.model.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user?.id || 'usr_me';
    let userPhone = req.query.phone || req.user?.phone || '';
    if (!userPhone && userId && userId !== 'usr_me') {
      try {
        const { UserModel } = await import('../models/user.model.js');
        const u = await UserModel.findById(userId).select('phone');
        if (u && u.phone) {
          userPhone = u.phone;
        }
      } catch (err) {
        console.warn('Phone resolution warning:', err.message);
      }
    }
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
    const userId = req.user?.id;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return ApiResponse.error(res, 'Notification not found or access denied', 404);
    }
    return ApiResponse.success(res, 'Notification marked as read', notification);
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user?.id;
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
    const userId = req.user?.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { actionStatus: action, isRead: true },
      { new: true }
    );
    if (!notification) {
      return ApiResponse.error(res, 'Notification not found or access denied', 404);
    }
    return ApiResponse.success(res, 'Notification action updated', notification);
  } catch (error) {
    next(error);
  }
};

export const createNotification = async (req, res, next) => {
  try {
    const { userId, title, body, type, data } = req.body;
    const requesterId = req.user?.id;
    const isAdmin = ['SECURITY_ADMIN', 'SYSTEM', 'EMPLOYER_ADMIN'].includes(req.user?.role);
    
    // Only privileged roles can dispatch notifications to arbitrary users; otherwise target is self
    const targetUserId = isAdmin && userId ? userId : requesterId;

    if (!title || !body) {
      return ApiResponse.error(res, 'Title and body are required', 400);
    }

    const notification = await Notification.create({
      userId: targetUserId,
      title: String(title).slice(0, 150),
      body: String(body).slice(0, 500),
      type: type || 'system',
      data: data || {},
    });

    return ApiResponse.success(res, 'Notification created successfully', notification, 201);
  } catch (error) {
    next(error);
  }
};
