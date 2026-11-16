import Payin from '../models/Payin.js';
import Group from '../models/Group.js';
import Transaction from '../models/Transaction.js';
import asyncHandler from '../utils/asyncHandler.js';
import { notifyPayinSuccess } from '../bot/commands.js';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDate(value, endOfDay = false) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

async function findPayin(identifier) {
  if (!identifier) return null;
  if (/^[0-9a-fA-F]{24}$/.test(String(identifier))) {
    const byId = await Payin.findById(identifier);
    if (byId) return byId;
  }
  return Payin.findOne({ payOrderNo: String(identifier) });
}

export const listPayins = asyncHandler(async (req, res) => {
  const requestedPage = Number(req.query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(200, requestedLimit)
    : 20;
  const skip = (page - 1) * limit;

  const filter = {};
  const and = [];

  // General search across common fields
  if (req.query.q) {
    const q = String(req.query.q).trim();
    if (q) {
      const or = [
        { payOrderNo: q },
        { outTradeNo: q },
        { uid: q },
        { upiId: { $regex: `^${escapeRegex(q)}` } },
        { payURL: { $regex: `^${escapeRegex(q)}` } },
        { merNo: q },
        { utrCode: q },
        { payState: q },
      ];
      const n = Number(q);
      if (Number.isFinite(n)) or.push({ groupId: n });
      and.push({ $or: or });
    }
  }

  if (req.query.groupId !== undefined && req.query.groupId !== '') {
    const n = Number(req.query.groupId);
    if (Number.isFinite(n)) filter.groupId = n;
  }
  if (req.query.orderId) filter.payOrderNo = String(req.query.orderId).trim();
  if (req.query.payOrderNo) filter.payOrderNo = String(req.query.payOrderNo).trim();
  if (req.query.outTradeNo) filter.outTradeNo = String(req.query.outTradeNo).trim();
  if (req.query.uid) filter.uid = String(req.query.uid).trim();
  if (req.query.upi || req.query.upiId) {
    filter.upiId = { $regex: `^${escapeRegex(String(req.query.upi || req.query.upiId).trim())}` };
  }
  if (req.query.status) filter.status = String(req.query.status).trim();
  if (req.query.payUrl || req.query.payURL) {
    filter.payURL = { $regex: `^${escapeRegex(String(req.query.payUrl || req.query.payURL).trim())}` };
  }
  if (req.query.payState) filter.payState = String(req.query.payState).trim();
  if (req.query.currencyCode) filter.currencyCode = String(req.query.currencyCode).trim();
  if (req.query.payType) filter.payType = String(req.query.payType).trim();
  if (req.query.merNo) filter.merNo = String(req.query.merNo).trim();

  // Amount filter: match against totalAmount string or deeplinkAmount
  if (req.query.amount !== undefined && req.query.amount !== '') {
    const amt = String(req.query.amount).trim();
    and.push({
      $or: [
        { deeplinkAmount: amt },
        { totalAmount: amt },
      ],
    });
  }

  const createdFrom = parseDate(req.query.createdFrom || req.query.from);
  const createdTo = parseDate(req.query.createdTo || req.query.to, true);
  if (createdFrom || createdTo) {
    filter.createdAt = {};
    if (createdFrom) filter.createdAt.$gte = createdFrom;
    if (createdTo) filter.createdAt.$lte = createdTo;
  }

  const updatedFrom = parseDate(req.query.updatedFrom);
  const updatedTo = parseDate(req.query.updatedTo, true);
  if (updatedFrom || updatedTo) {
    filter.updatedAt = {};
    if (updatedFrom) filter.updatedAt.$gte = updatedFrom;
    if (updatedTo) filter.updatedAt.$lte = updatedTo;
  }

  if (and.length) filter.$and = and;

  const [payins, total] = await Promise.all([
    Payin.find(filter)
      .select('payOrderNo outTradeNo merNo uid groupId upiId totalAmount deeplinkAmount currencyCode payType status payState payURL utrCode paidAt createdAt updatedAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('group', 'uid groupId groupName status exchangeRate')
      .lean(),
    Payin.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    payins,
  });
});

export const getPayin = asyncHandler(async (req, res) => {
  const payin = await findPayin(req.params.id);
  if (!payin) return res.status(404).json({ success: false, msg: 'Payin not found' });
  const populated = await Payin.findById(payin._id)
    .populate('group', 'uid groupId groupName status exchangeRate balance')
    .lean();
  return res.json({ success: true, payin: populated });
});

export const approvePayin = asyncHandler(async (req, res) => {
  const payin = await findPayin(req.params.id);
  if (!payin) return res.status(404).json({ success: false, msg: 'Payin not found' });

  if (payin.status === 'success') {
    return res.json({ success: true, msg: 'Payin already approved', payin });
  }

  payin.status = 'success';
  payin.payState = '0000';
  if (!payin.paidAt) payin.paidAt = new Date();
  if (req.body?.utrCode) payin.utrCode = String(req.body.utrCode);

  let groupChatId = payin.groupId;
  // Credit the group ledger and record a transaction once (idempotent)
  if (payin.group) {
    const existingTx = await Transaction.findOne({ payin: payin._id, type: 'credit', coType: 'payin' });
    const group = await Group.findById(payin.group);
    if (group) {
      groupChatId = group.groupId;
      if (!existingTx) {
        const amount = Number(payin.totalAmount?.toString?.() ?? 0);
        const current = Number(group.balance?.toString?.() ?? '0');
        group.balance = (current + amount).toFixed(2);
        await group.save();

        await Transaction.create({
          uid: group.uid,
          groupId: group.groupId,
          amount: payin.totalAmount,
          type: 'credit',
          coType: 'payin',
          payin: payin._id,
        });
      }
    }
  }

  await payin.save();
  await notifyPayinSuccess({
    orderId: payin.payOrderNo,
    amount: payin.deeplinkAmount || payin.totalAmount?.toString?.() || 0,
    groupId: groupChatId,
  });

  const populated = await Payin.findById(payin._id)
    .populate('group', 'uid groupId groupName status exchangeRate balance')
    .lean();
  return res.json({ success: true, msg: 'Payin approved', payin: populated });
});
