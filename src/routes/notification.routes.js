import { Router } from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  updateActionStatus,
  createNotification,
} from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getNotifications);
router.post('/', createNotification);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.patch('/:id/action', updateActionStatus);

export default router;
