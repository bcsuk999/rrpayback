import Group from '../models/Group.js';
import asyncHandler from '../utils/asyncHandler.js';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const listGroups = asyncHandler(async (req, res) => {
  const requestedPage = Number(req.query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(100, requestedLimit)
    : 20;
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.query.uid) filter.uid = String(req.query.uid).trim();
  if (req.query.groupId !== undefined && req.query.groupId !== '') {
    const groupId = Number(req.query.groupId);
    if (Number.isFinite(groupId)) filter.groupId = groupId;
  }
  if (req.query.status) filter.status = String(req.query.status).trim();

  const search = String(req.query.search || req.query.q || '').trim();
  if (search) {
    const matches = [
      { uid: search },
      { groupName: { $regex: `^${escapeRegex(search)}` } },
    ];
    const groupId = Number(search);
    if (Number.isFinite(groupId)) matches.push({ groupId });
    filter.$or = matches;
  }

  const [groups, count] = await Promise.all([
    Group.find(filter)
      .select('uid groupId groupName exchangeRate status remark balance createdAt updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Group.countDocuments(filter),
  ]);
  return res.json({
    success: true,
    count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
    groups,
  });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, remark, exchangeRate, groupName } = req.body ?? {};

  let group = await Group.findById(id).catch(() => null);
  if (!group && /^-?\d+$/.test(String(id))) group = await Group.findOne({ groupId: Number(id) });
  if (!group) return res.status(404).json({ success: false, msg: 'Group not found' });

  if (status !== undefined) {
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, msg: 'Invalid status' });
    }
    if (!remark || !String(remark).trim()) {
      return res.status(400).json({ success: false, msg: 'Remark is required when changing status' });
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
