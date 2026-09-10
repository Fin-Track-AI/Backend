import { ApiResponse } from '../utils/apiResponse.js';

export const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    // Logic for user registration
    return ApiResponse.success(res, 'User registered successfully', { user: { email, name } }, 201);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    // Logic for user authentication
    return ApiResponse.success(res, 'User logged in successfully', {
      token: 'mock_jwt_token_xyz123',
      user: { email, name: 'Sample User' },
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    return ApiResponse.success(res, 'Profile retrieved successfully', { user: req.user });
  } catch (error) {
    next(error);
  }
};
