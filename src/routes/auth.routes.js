import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import {
  sendEmailOtp,
  verifyEmailOtp,
  register,
  login,
  loginWithPassword,
  setPassword,
  resetPasswordWithOtp,
  getProfile,
  updateProfile,
  deleteAccount,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Auth Rate Limiter (25 requests per 15 minutes to prevent brute force and OTP flood)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'test' ? 10000 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

router.post('/send-otp', authLimiter, sendEmailOtp);
router.post('/verify-otp', authLimiter, verifyEmailOtp);
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/login-password', authLimiter, loginWithPassword);
router.post('/reset-password-otp', authLimiter, resetPasswordWithOtp);

// Authenticated user profile and session routes
router.post('/set-password', authenticate, setPassword);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.delete('/account', authenticate, deleteAccount);

export default router;
