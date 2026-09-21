import { Router } from 'express';
import {
  linkEmployer,
  getLinkedEmployer,
  unlinkEmployer,
  getCompanyEmployees,
} from '../controllers/employer.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// 1. Employer Dashboard Route
router.get('/employees', getCompanyEmployees);

// 2. Employee Mobile Routes
router.use(authenticate);
router.post('/link', linkEmployer);
router.get('/', getLinkedEmployer);
router.delete('/unlink', unlinkEmployer);

export default router;
