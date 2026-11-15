import Group from '../models/Group.js';
import asyncHandler from '../utils/asyncHandler.js';

function genUid() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

export const registerGroup = asyncHandler(async (req, res) => {
  const { groupId, groupName, uid } = req.body ?? {};
  if (!groupId) return res.status(400).json({ error: 'groupId is required' });

  const gid = Number(groupId);
  if (!Number.isFinite(gid)) return res.status(400).json({ error: 'invalid groupId' });

  let group = await Group.findOne({ groupId: gid });
  if (group) {
    // Update name if provided
    if (groupName) group.groupName = groupName;
    await group.save();
    return res.json({ uid: group.uid, groupId: group.groupId, groupName: group.groupName, status: group.status });
  }

  // Generate unique uid
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

  return res.status(201).json({ uid: group.uid, groupId: group.groupId, groupName: group.groupName, status: group.status });
});

export const getGroup = asyncHandler(async (req, res) => {
  const gid = Number(req.params.id);
  if (!Number.isFinite(gid)) return res.status(400).json({ error: 'invalid groupId' });
  const group = await Group.findOne({ groupId: gid });
  if (!group) return res.status(404).json({ error: 'group not found' });
  return res.json({ uid: group.uid, groupId: group.groupId, groupName: group.groupName, status: group.status, balance: group.balance?.toString?.() });
});
