import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { listGroups, updateGroup } from '../controllers/adminGroupController.js';

const router = Router();

router.get('/groups', requireAdmin, listGroups);
router.patch('/groups/:id', requireAdmin, updateGroup);

export default router;
