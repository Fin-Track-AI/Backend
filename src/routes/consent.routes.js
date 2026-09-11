import { Router } from 'express';
import { getConsents, updateConsents, revokeConsent } from '../controllers/consent.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getConsents);
router.post('/', updateConsents);
router.delete('/:consentType', revokeConsent);

export default router;
