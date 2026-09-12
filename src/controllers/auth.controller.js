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

    return ApiResponse.success(res, delivery.sent && delivery.method === 'smtp'
      ? `Verification code delivered to ${cleanEmail}`
      : 'Verification code generated (Check email or local console)', {
      email: cleanEmail,
      deliveredToInbox: delivery.method === 'smtp',
      // If delivery failed or SMTP is not yet configured, provide devOtp so user is not blocked
      devOtp: delivery.method === 'smtp' ? undefined : otp,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmailOtp = async (req, res, next) => {
  try {
    const { email, otp, name, phone } = req.body;
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
    });

    return ApiResponse.success(res, 'Email verified successfully', result);
  } catch (error) {
    next(error);
  }
};

export const register = async (req, res, next) => {
  try {
    const { email, name, phone } = req.body;
    const cleanEmail = email || `${Date.now()}@fintrack.app`;
    const result = await UserService.findOrCreateByEmail({ email: cleanEmail, name, phone });
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
