import { Router } from 'express';
import {
  sendEmailOtp,
  verifyEmailOtp,
  register,
  login,
  getProfile,
  updateProfile,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/send-otp', sendEmailOtp);
router.post('/verify-otp', verifyEmailOtp);
router.post('/register', register);
router.post('/login', login);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

export default router;
