import Group from '../models/Group.js';
import asyncHandler from '../utils/asyncHandler.js';

function genUid() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

async function findGroup(identifier) {
  if (!identifier) return null;
  // Try ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(String(identifier))) {
    const g = await Group.findById(identifier);
    if (g) return g;
  }
  // uid (5 digits)
  if (/^\d{4,6}$/.test(String(identifier))) {
    const byUid = await Group.findOne({ uid: String(identifier) });
    if (byUid) return byUid;
  }
  // groupId (telegram chat id, possibly negative)
  const n = Number(identifier);
  if (Number.isFinite(n)) {
    const byGid = await Group.findOne({ groupId: n });
    if (byGid) return byGid;
  }
  return null;
}

export const registerGroup = asyncHandler(async (req, res) => {
  const { groupId, groupName, uid } = req.body ?? {};
  if (groupId === undefined || groupId === null) {
    return res.status(400).json({ error: 'groupId is required' });
  }
  const gid = Number(groupId);
  if (!Number.isFinite(gid)) return res.status(400).json({ error: 'invalid groupId' });

  let group = await Group.findOne({ groupId: gid });
  if (group) {
    if (groupName) group.groupName = groupName;
    await group.save();
    return res.json({ _id: group._id, uid: group.uid, groupId: group.groupId, groupName: group.groupName, status: group.status });
  }

  let newUid = uid ? String(uid) : genUid();
  for (let i = 0; i < 10; i++) {
    const exists = await Group.findOne({ uid: newUid });
    if (!exists) break;
    newUid = genUid();
  }

  group = await Group.create({
    uid: newUid,
    groupId: gid,
    groupName: groupName || '',
    status: 'active',
  });

  return res.status(201).json({ _id: group._id, uid: group.uid, groupId: group.groupId, groupName: group.groupName, status: group.status });
});

export const getGroup = asyncHandler(async (req, res) => {
  const group = await findGroup(req.params.id);
  if (!group) return res.status(404).json({ error: 'group not found' });
  return res.json({ _id: group._id, uid: group.uid, groupId: group.groupId, groupName: group.groupName, status: group.status, balance: group.balance?.toString?.(), exchangeRate: group.exchangeRate, remark: group.remark, createdAt: group.createdAt, updatedAt: group.updatedAt });
});

export const listGroups = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.uid) filter.uid = String(req.query.uid);
  if (req.query.groupId) filter.groupId = Number(req.query.groupId);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const s = String(req.query.search);
    filter.$or = [
      { uid: s },
      { groupName: { $regex: s, $options: 'i' } },
    ];
    const n = Number(s);
    if (Number.isFinite(n)) filter.$or.push({ groupId: n });
  }

  const [groups, total] = await Promise.all([
    Group.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Group.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    groups,
  });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const group = await findGroup(req.params.id);
  if (!group) return res.status(404).json({ success: false, msg: 'Group not found' });

  const { status, remark, exchangeRate, groupName } = req.body ?? {};

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
