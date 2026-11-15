import { Router } from 'express';
import { createPayin } from '../controllers/payinController.js';

const router = Router();

// POST {DOMAIN_URL}/payin/create — merchant requests a deposit payment address.
router.post('/create', createPayin);

export default router;
