import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { listGroups, updateGroup } from '../controllers/adminGroupController.js';
import { listPayins, getPayin, approvePayin } from '../controllers/adminPayinController.js';
import { listTransactions, createTransaction } from '../controllers/adminTransactionController.js';
import { createPayout } from '../controllers/adminPayoutController.js';

const router = Router();

router.get('/groups', requireAdmin, listGroups);
router.patch('/groups/:id', requireAdmin, updateGroup);

router.get('/payins', requireAdmin, listPayins);
router.get('/payins/:id', requireAdmin, getPayin);
router.patch('/payins/:id/approve', requireAdmin, approvePayin);

router.get('/transactions', requireAdmin, listTransactions);
router.post('/transactions', requireAdmin, createTransaction);

// POST /admin/payouts — submit a RRPAY payout (cashOutExc/create) and debit the group.
router.post('/payouts', requireAdmin, createPayout);

export default router;
