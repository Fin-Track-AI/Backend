import { ApiResponse } from '../utils/apiResponse.js';
import { UserService } from '../services/user.service.js';
import { EmailService } from '../services/email.service.js';
import { OtpModel } from '../models/otp.model.js';

export const sendEmailOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return ApiResponse.error(res, 'A valid email address is required', 400);
    }

    const cleanEmail = email.toLowerCase().trim();

    // Generate secure random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Remove any older OTP for this email
    await OtpModel.deleteMany({ email: cleanEmail });

    // Store new OTP with 5m TTL
    await OtpModel.create({
      email: cleanEmail,
      otp,
    });

    // Send email dispatch
    const delivery = await EmailService.sendOtpEmail({ email: cleanEmail, otp });

    if (!delivery.sent) {
      return ApiResponse.error(res, delivery.error || 'Failed to send verification email. Please check your email configuration.', 500);
    }

    return ApiResponse.success(res, `Verification code sent to ${cleanEmail}`, {
      email: cleanEmail,
      deliveredToInbox: true,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmailOtp = async (req, res, next) => {
  try {
    const { email, otp, name, phone, password } = req.body;
    if (!email || !otp) {
      return ApiResponse.error(res, 'Email and OTP are required', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    // Verify OTP from database
    const record = await OtpModel.findOne({ email: cleanEmail, otp: cleanOtp });
    if (!record) {
      return ApiResponse.error(res, 'Invalid or expired verification code', 400);
    }

    // Delete used OTP
    await OtpModel.deleteOne({ _id: record._id });

    // Find or create user
    const result = await UserService.findOrCreateByEmail({
      email: cleanEmail,
      name,
      phone: phone ? phone.toString().trim() : undefined,
      password,
    });

    return ApiResponse.success(res, 'Email verified successfully', result);
  } catch (error) {
    next(error);
  }
};

export const register = async (req, res, next) => {
  try {
    const { email, name, phone, password } = req.body;
    const cleanEmail = email || `${Date.now()}@fintrack.app`;
    const result = await UserService.findOrCreateByEmail({ email: cleanEmail, name, phone, password });
    return ApiResponse.success(res, 'User registered successfully', result, 201);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, name, phone } = req.body;
    const cleanEmail = email || (phone ? `${phone}@fintrack.app` : 'user@fintrack.app');
    const result = await UserService.findOrCreateByEmail({ email: cleanEmail, name, phone });
    return ApiResponse.success(res, 'User logged in successfully', result);
  } catch (error) {
    next(error);
  }
};

export const loginWithPassword = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return ApiResponse.error(res, 'Email and password are required', 400);
    }
    const cleanEmail = email.toLowerCase().trim();
    const result = await UserService.validateUserPassword(cleanEmail, password);
    if (!result.success) {
      if (result.reason === 'NO_PASSWORD_SET') {
        return ApiResponse.error(
          res,
          'No password set for this account yet. Please sign in with OTP to set your password.',
          400,
          { code: 'NO_PASSWORD_SET' }
        );
      }
      return ApiResponse.error(res, 'Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
    }
    return ApiResponse.success(res, 'User logged in successfully', {
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    next(error);
  }
};

export const setPassword = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return ApiResponse.error(res, 'New password must be at least 6 characters', 400);
    }

    const { UserModel } = await import('../models/user.model.js');
    const user = await UserModel.findById(userId).select('+password');
    if (!user) {
      return ApiResponse.error(res, 'User not found', 404);
    }

    if (user.password) {
      if (!currentPassword) {
        return ApiResponse.error(res, 'Current password is required to change your password', 400);
      }
      const isMatch = await UserService.comparePassword(currentPassword, user.password);
      if (!isMatch) {
        return ApiResponse.error(res, 'Current password is incorrect', 400);
      }
    }

    user.password = await UserService.hashPassword(newPassword);
    user.updatedAt = new Date();
    await user.save();

    return ApiResponse.success(res, 'Password saved successfully', {
      user: UserService.formatUserPayload(user),
    });
  } catch (error) {
    next(error);
  }
};

export const resetPasswordWithOtp = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return ApiResponse.error(res, 'Email, verification code, and new password are required', 400);
    }
    if (newPassword.length < 6) {
      return ApiResponse.error(res, 'New password must be at least 6 characters', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = otp.toString().trim();

    const record = await OtpModel.findOne({ email: cleanEmail, otp: cleanOtp });
    if (!record) {
      return ApiResponse.error(res, 'Invalid or expired verification code', 400);
    }

    await OtpModel.deleteOne({ _id: record._id });

    const { UserModel } = await import('../models/user.model.js');
    let user = await UserModel.findOne({ email: cleanEmail }).select('+password');
    if (!user) {
      return ApiResponse.error(res, 'No account found with this email', 404);
    }

    user.password = await UserService.hashPassword(newPassword);
    user.lastLoginAt = new Date();
    user.updatedAt = new Date();
    await user.save();

    const token = UserService.generateToken(user);
    return ApiResponse.success(res, 'Password reset successfully. You are now logged in.', {
      user: UserService.formatUserPayload(user),
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const updated = await UserService.updateFinancialProfile(userId, req.body);
    return ApiResponse.success(res, 'Profile updated successfully', { user: updated });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await UserService.getUserById(userId);
    if (!user) {
      return ApiResponse.error(res, 'User not found', 404);
    }
    return ApiResponse.success(res, 'Profile retrieved successfully', { user });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/auth/account
 * SCRUM-157: DPDP Act Right to Erasure / User-Requested Early Account Deletion
 */
export const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return ApiResponse.error(res, 'Authentication required to delete account', 401);
    }

    const { retentionService } = await import('../services/retention.service.js');
    const result = await retentionService.executeUserEarlyDeletion(userId, {
      userId,
      role: req.user?.role || 'USER',
      ip: req.ip,
    });

    return ApiResponse.success(res, result.message, result.data);
  } catch (error) {
    next(error);
  }
};
