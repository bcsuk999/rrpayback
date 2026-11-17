import { Router } from 'express';
import { handleNgpayNotify } from '../controllers/ngpayNotifyController.js';
import { createNgpayOrder } from '../controllers/ngpayOrderController.js';

const router = Router();

// POST /api/ngpay/order — create an NGPay pay order.
router.post('/order', createNgpayOrder);

// POST /api/ngpay/notify — NGPay async payment result callback.
router.post('/notify', handleNgpayNotify);

export default router;
