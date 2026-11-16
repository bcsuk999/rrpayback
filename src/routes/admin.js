import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { listGroups, updateGroup } from '../controllers/adminGroupController.js';
import { listPayins, getPayin, approvePayin } from '../controllers/adminPayinController.js';

const router = Router();

router.get('/groups', requireAdmin, listGroups);
router.patch('/groups/:id', requireAdmin, updateGroup);

router.get('/payins', requireAdmin, listPayins);
router.get('/payins/:id', requireAdmin, getPayin);
router.patch('/payins/:id/approve', requireAdmin, approvePayin);

export default router;
