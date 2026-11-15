import Group from '../models/Group.js';
import asyncHandler from '../utils/asyncHandler.js';

export const listGroups = asyncHandler(async (req, res) => {
  const groups = await Group.find().sort({ createdAt: -1 }).lean();
  return res.json({ success: true, count: groups.length, groups });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, remark, exchangeRate, groupName } = req.body ?? {};

  const group = await Group.findById(id);
  if (!group) return res.status(404).json({ success: false, msg: 'Group not found' });

  if (status !== undefined) {
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, msg: 'Invalid status' });
    }
    group.status = status;
  }
  if (remark !== undefined) group.remark = String(remark);
  if (groupName !== undefined) group.groupName = String(groupName);
  if (exchangeRate !== undefined) {
    const n = Number(exchangeRate);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ success: false, msg: 'Invalid exchangeRate' });
    }
    group.exchangeRate = n;
  }

  await group.save();
  return res.json({ success: true, msg: 'Group updated', group });
});
