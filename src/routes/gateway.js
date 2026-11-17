import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { listGateways, updateGatewayStatus } from '../controllers/adminGatewayController.js';

const router = Router();

// GET /admin/gateways — list all gateways and their status.
router.get('/', requireAdmin, listGateways);

// PATCH /admin/gateways/:id — set gateway status (active / inactive).
router.patch('/:id', requireAdmin, updateGatewayStatus);

export default router;
