import Gateway from '../models/Gateway.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * GET /api/admin/gateways
 * List all payment gateways with their status and pay type.
 */
export const listGateways = asyncHandler(async (req, res) => {
  const gateways = await Gateway.find()
    .select('name status payType config createdAt updatedAt')
    .sort({ name: 1 })
    .lean();

  return res.json({ success: true, gateways });
});

/**
 * PATCH /api/admin/gateways/:id
 * Update a gateway's status (active / inactive) and/or pay type.
 * Only one gateway can be active at a time — activating one deactivates the other.
 *
 * Body:
 *   { "status": "active" }           // activate / deactivate
 *   { "payType": "JAZZ_CASH" }       // change payment type
 *   { "status": "active", "payType": "JAZZ_CASH" } // both
 */
export const updateGatewayStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, payType } = req.body ?? {};

  if (status !== undefined && !['active', 'inactive'].includes(status)) {
    return res.status(400).json({ success: false, msg: 'status must be "active" or "inactive"' });
  }

  const gateway = await Gateway.findById(id);
  if (!gateway) {
    return res.status(404).json({ success: false, msg: 'Gateway not found' });
  }

  // Mutual exclusivity: activating one gateway deactivates the other.
  if (status === 'active' && gateway.status !== 'active') {
    await Gateway.updateMany({ name: { $ne: gateway.name } }, { status: 'inactive' });
  }

  if (status !== undefined) gateway.status = status;
  if (payType !== undefined) gateway.payType = String(payType).trim();

  await gateway.save();

  return res.json({
    success: true,
    msg: `Gateway ${gateway.name} updated`,
    gateway,
  });
});
