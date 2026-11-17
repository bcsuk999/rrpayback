import Gateway from '../models/Gateway.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * GET /admin/gateways
 * List all payment gateways with their status (active/inactive).
 */
export const listGateways = asyncHandler(async (req, res) => {
  const gateways = await Gateway.find()
    .select('name status config createdAt updatedAt')
    .sort({ name: 1 })
    .lean();

  return res.json({ success: true, gateways });
});

/**
 * PATCH /admin/gateways/:id
 * Update a gateway's status (active / inactive).
 * Only one gateway can be active at a time — activating one deactivates the other.
 */
export const updateGatewayStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};

  if (!status || !['active', 'inactive'].includes(status)) {
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

  gateway.status = status;
  await gateway.save();

  return res.json({ success: true, msg: `Gateway ${gateway.name} set to ${status}`, gateway });
});
