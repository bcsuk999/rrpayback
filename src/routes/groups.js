import { Router } from 'express';
import { registerGroup, getGroup } from '../controllers/groupController.js';

const router = Router();

router.post('/register', registerGroup);
router.get('/:id', getGroup);

export default router;
