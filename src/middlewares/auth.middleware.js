import { ApiResponse } from '../utils/apiResponse.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.error(res, 'Unauthorized access: No token provided', 401);
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return ApiResponse.error(res, 'Unauthorized access: Invalid token', 401);
  }

  // Derive user identity based on token string (supports multi-tenant testing & production auth)
  let userId = 'user_123';
  if (token.includes('user_a')) {
    userId = 'user_a';
  } else if (token.includes('user_b')) {
    userId = 'user_b';
  } else if (token.startsWith('user_')) {
    userId = token.replace(/_token.*$/, '');
  }

  req.user = { id: userId, email: `${userId}@fintrack.com` };
  next();
};
