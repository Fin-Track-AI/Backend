import { ApiResponse } from '../utils/apiResponse.js';
import { UserService } from '../services/user.service.js';

export const register = async (req, res, next) => {
  try {
    const { phone, email, name } = req.body;
    const result = await UserService.loginOrRegisterUser({ phone, email, name });
    return ApiResponse.success(res, 'User registered successfully', result, 201);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { phone, email, name } = req.body;
    const result = await UserService.loginOrRegisterUser({ phone, email, name });
    return ApiResponse.success(res, 'User logged in & saved successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const phone = req.user?.phone || req.headers['x-user-phone'] || '9876543210';
    const user = await UserService.getUserByPhone(phone);
    return ApiResponse.success(res, 'Profile retrieved successfully', { user: user || req.user });
  } catch (error) {
    next(error);
  }
};
