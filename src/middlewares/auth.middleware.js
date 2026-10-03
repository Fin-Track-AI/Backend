import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { ApiResponse } from '../utils/apiResponse.js';
import { config } from '../config/env.js';
import { UserModel } from '../models/user.model.js';

/**
 * Authentication Middleware
 * Strictly verifies JWT tokens against the server secret key with HS256 algorithm pinning.
 * Rejects unauthenticated requests and removes all hardcoded backdoor bypasses.
 */
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.error(res, 'Unauthorized access: No token provided', 401);
  }

  const token = authHeader.split(' ')[1];
  if (!token || !token.trim()) {
    return ApiResponse.error(res, 'Unauthorized access: Invalid token format', 401);
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });

    req.user = {
      id: decoded.userId || decoded.id,
      phone: decoded.phone || '',
      email: decoded.email || '',
      role: decoded.role || 'USER',
      employerId: decoded.employerId || null,
    };

    if (req.user.id && mongoose.isValidObjectId(req.user.id)) {
      try {
        const dbUser = await UserModel.findById(req.user.id).select('phone role employerId');
        if (dbUser) {
          if (dbUser.phone) {
            req.user.phone = dbUser.phone;
          }
          if (dbUser.role) {
            req.user.role = dbUser.role;
          }
          if (dbUser.employerId) {
            req.user.employerId = dbUser.employerId;
          }
        }
      } catch (err) {
        console.warn('[Auth Middleware] User resolution warning:', err.message);
      }
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return ApiResponse.error(res, 'Session expired. Please log in again.', 401);
    }
    return ApiResponse.error(res, 'Unauthorized access: Invalid or tampered token.', 401);
  }
};

/**
 * Role-Based Access Control (RBAC) Middleware Factory
 * Ensures authenticated user possesses at least one of the allowed roles.
 *
 * @param {...string} allowedRoles - E.g. 'EMPLOYER_ADMIN', 'FINANCE_CONTROLLER', 'SECURITY_ADMIN'
 */
export const requireRole = (...allowedRoles) => {
  const flatRoles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Authentication required', 401);
    }

    const currentRole = req.user.role || 'USER';
    if (!flatRoles.includes(currentRole)) {
      return ApiResponse.error(
        res,
        `Access denied: Action requires one of [${flatRoles.join(', ')}] role privileges.`,
        403,
        { requiredRoles: flatRoles, currentRole }
      );
    }

    next();
  };
};
