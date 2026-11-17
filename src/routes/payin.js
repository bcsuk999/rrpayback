import { Router } from 'express';
import { env } from '../config/env.js';
import { createPayin, signPayinRequest } from '../controllers/payinController.js';
import { createPayinOrder } from '../controllers/payinOrderController.js';
import { handlePayinNotify } from '../controllers/payinNotifyController.js';
import { handlePayoutNotify } from '../controllers/payoutNotifyController.js';

const router = Router();

// POST {DOMAIN_URL}/payin/create — merchant requests a deposit payment address.
router.post('/create', createPayin);

// POST {DOMAIN_URL}/payin/order — amount-only shortcut: builds and signs the whole
// RRPay request, forwards it to {RRPAY_BASE_URL}/payin/create, and mirrors the reply.
router.post('/order', createPayinOrder);

// POST {DOMAIN_URL}/payin/notify — RRPay async payment result callback.
router.post('/notify', handlePayinNotify);

// POST {DOMAIN_URL}/payin/payout-notify — RRPAY async payout (cashOutExc) result callback.
router.post('/payout-notify', handlePayoutNotify);

// Dev-only sign helper used by Swagger UI. Never mounted in production.
if (env.nodeEnv !== 'production') {
  router.post('/sign', signPayinRequest);
}

export default router;
