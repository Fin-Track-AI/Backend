import { ApiResponse } from '../utils/apiResponse.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.error(res, 'Unauthorized access: No token provided', 401);
  }

  // Placeholder token verification
  const token = authHeader.split(' ')[1];
  if (!token) {
    return ApiResponse.error(res, 'Unauthorized access: Invalid token', 401);
  }

  // Attach mock user object
  req.user = { id: 'user_123', email: 'user@fintrack.com' };
  next();
};
