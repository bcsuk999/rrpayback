import { Router } from 'express';
import { env } from '../config/env.js';
import { createPayin, signPayinRequest } from '../controllers/payinController.js';

const router = Router();

// POST {DOMAIN_URL}/payin/create — merchant requests a deposit payment address.
router.post('/create', createPayin);

// Dev-only sign helper used by Swagger UI. Never mounted in production.
if (env.nodeEnv !== 'production') {
  router.post('/sign', signPayinRequest);
}

export default router;
