import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  getBudget,
  setBudget,
  getAlerts,
  getPeerBenchmark,
} from '../controllers/budget.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getBudget);
router.post('/', setBudget);
router.put('/', setBudget);
router.get('/alerts', getAlerts);
router.get('/peer-benchmark', getPeerBenchmark);

export default router;
