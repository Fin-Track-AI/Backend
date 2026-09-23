import { Router } from 'express';
import {
  createGroup,
  getGroups,
  getGroupById,
  deleteGroup,
  lookupUserByPhone,
  respondToInvitation,
  getInvitations,
  addMember,
  addExpense,
  getGroupBalances,
  markSettlement,
  getReminderMessage,
} from '../controllers/split.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Allow optional/bypass authentication or standard auth for group operations
router.use(authenticate);

// User lookup by registered mobile phone
router.get('/users/lookup', lookupUserByPhone);

// Group invitations
router.get('/invitations', getInvitations);
router.post('/groups/:id/invitation', respondToInvitation);

// Group management (BR-16)
router.post('/groups', createGroup);
router.get('/groups', getGroups);
router.get('/groups/:id', getGroupById);
router.delete('/groups/:id', deleteGroup);
router.post('/groups/:id/members', addMember);

// Expense splitting across 3 split methods (BR-17)
router.post('/groups/:id/expenses', addExpense);

// Debt simplification and net balances (BR-18)
router.get('/groups/:id/balances', getGroupBalances);

// Non-monetary settlement tracking (BR-19)
router.post('/settlements', markSettlement);

// Gentle reminders (BR-19)
router.get('/reminder', getReminderMessage);

export default router;
