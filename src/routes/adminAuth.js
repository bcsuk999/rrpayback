import { Router } from 'express';
import { registerAdmin, loginAdmin } from '../controllers/adminAuthController.js';

const router = Router();

router.post('/register', registerAdmin);
router.post('/login', loginAdmin);

export default router;
