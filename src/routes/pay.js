import { Router } from 'express';
import { getPayPage } from '../controllers/payinController.js';

const router = Router();

// Hosted payment page target returned as payURL.
router.get('/:payOrderNo', getPayPage);

export default router;
