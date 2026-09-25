import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { categoryController } from '../controllers/category.controller.js';

const router = Router();

router.use(authenticate);

router.post('/recategorize', categoryController.recategorizeTransaction);

export default router;
