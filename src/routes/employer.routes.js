import { Router } from 'express';
import { linkEmployer, getLinkedEmployer, unlinkEmployer } from '../controllers/employer.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.post('/link', linkEmployer);
router.get('/', getLinkedEmployer);
router.delete('/unlink', unlinkEmployer);

export default router;
