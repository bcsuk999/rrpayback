import { Router } from 'express';
import { createNgpayTestOrder } from '../controllers/testController.js';

const router = Router();

// GET /api/test/ngpay/:amount — test-only: create an NGPay order of the given amount.
// Example: GET /api/test/ngpay/1000
router.get('/ngpay/:amount', createNgpayTestOrder);

export default router;
