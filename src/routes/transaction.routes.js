import { Router } from 'express';
import { getTransactions, createTransaction } from '../controllers/transaction.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getTransactions);
router.post('/', createTransaction);

export default router;
