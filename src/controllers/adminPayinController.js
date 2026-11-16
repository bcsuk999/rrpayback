import Payin from '../models/Payin.js';
import Group from '../models/Group.js';
import Transaction from '../models/Transaction.js';
import asyncHandler from '../utils/asyncHandler.js';
import { notifyPayinSuccess } from '../bot/commands.js';

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

const PAYIN_DETAIL_SELECT = '-rawRequest -rawResponse';

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

  if (req.query.groupId !== undefined && req.query.groupId !== '') {
    const n = Number(req.query.groupId);
    if (Number.isFinite(n)) filter.groupId = n;
  }
  if (req.query.orderId) filter.payOrderNo = String(req.query.orderId).trim();
  if (req.query.payOrderNo) filter.payOrderNo = String(req.query.payOrderNo).trim();
  if (req.query.outTradeNo) filter.outTradeNo = String(req.query.outTradeNo).trim();
  if (req.query.uid) filter.uid = String(req.query.uid).trim();
  if (req.query.status) filter.status = String(req.query.status).trim();
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

  const includeTotal = String(req.query.includeTotal ?? 'true').toLowerCase() !== 'false';

  const payinsQuery = Payin.find(filter)
    .select('payOrderNo outTradeNo uid groupId upiId totalAmount deeplinkAmount currencyCode payType status payState payURL utrCode paidAt createdAt updatedAt')
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .populate('group', 'groupId groupName -_id')
    .lean();

  const [payins, total] = await Promise.all([
    payinsQuery,
    includeTotal ? Payin.countDocuments(filter) : Promise.resolve(null),
  ]);

  return res.json({
    success: true,
    page,
    limit,
    ...(includeTotal ? { total, totalPages: Math.ceil(total / limit) } : {}),
    hasMore: payins.length === limit,
    payins,
  });
});

export const getPayin = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const byId = /^[0-9a-fA-F]{24}$/.test(String(id))
    ? await Payin.findById(id)
        .select(`${PAYIN_DETAIL_SELECT} -merNo`)
        .populate('group', 'uid groupId groupName status exchangeRate balance -_id')
        .lean()
    : null;
  const payin = byId || await Payin.findOne({ payOrderNo: String(id) })
    .select(`${PAYIN_DETAIL_SELECT} -merNo`)
    .populate('group', 'uid groupId groupName status exchangeRate balance -_id')
    .lean();
  if (!payin) return res.status(404).json({ success: false, msg: 'Payin not found' });
  return res.json({ success: true, payin });
});

export const approvePayin = asyncHandler(async (req, res) => {
  const payin = await findPayin(req.params.id);
  if (!payin) return res.status(404).json({ success: false, msg: 'Payin not found' });

  if (payin.status === 'success') {
    const populated = await Payin.findById(payin._id)
      .select(`${PAYIN_DETAIL_SELECT} -merNo`)
      .populate('group', 'uid groupId groupName status exchangeRate balance -_id')
      .lean();
    return res.json({ success: true, msg: 'Payin already approved', payin: populated || payin });
  }

  const paidAt = payin.paidAt || new Date();
  const utrCode = req.body?.utrCode !== undefined ? String(req.body.utrCode) : payin.utrCode;

  // Atomically claim approval to reduce double-credit races.
  const claimed = await Payin.findOneAndUpdate(
    { _id: payin._id, status: { $ne: 'success' } },
    { $set: { status: 'success', payState: '0000', paidAt, ...(utrCode ? { utrCode } : {}) } },
    { new: true }
  );

  if (!claimed) {
    const populated = await Payin.findById(payin._id)
      .select(`${PAYIN_DETAIL_SELECT} -merNo`)
      .populate('group', 'uid groupId groupName status exchangeRate balance -_id')
      .lean();
    return res.json({ success: true, msg: 'Payin already approved', payin: populated || payin });
  }

  let groupChatId = claimed.groupId;
  // Credit the group ledger and record a transaction once (idempotent)
  if (claimed.group) {
    const existingTx = await Transaction.findOne({ payin: claimed._id, type: 'credit', coType: 'payin' }).select('_id').lean();
    const group = await Group.findById(claimed.group);
    if (group) {
      groupChatId = group.groupId;
      if (!existingTx) {
        const amount = Number(claimed.totalAmount?.toString?.() ?? 0);
        const current = Number(group.balance?.toString?.() ?? '0');
        group.balance = (current + amount).toFixed(2);
        await group.save();

        try {
          await Transaction.create({
            uid: group.uid,
            groupId: group.groupId,
            amount: claimed.totalAmount,
            type: 'credit',
            coType: 'payin',
            payin: claimed._id,
          });
        } catch (err) {
          // If a concurrent request created the credit transaction, avoid failing approval.
          if (err?.code !== 11000) throw err;
        }
      }
    }
  }

  try {
    await notifyPayinSuccess({
      orderId: claimed.payOrderNo,
      amount: claimed.deeplinkAmount || claimed.totalAmount?.toString?.() || 0,
      groupId: groupChatId,
    });
  } catch (err) {
    console.error('notifyPayinSuccess failed after approval:', err?.message || err);
  }

  const populated = await Payin.findById(claimed._id)
    .select(`${PAYIN_DETAIL_SELECT} -merNo`)
    .populate('group', 'uid groupId groupName status exchangeRate balance -_id')
    .lean();
  return res.json({ success: true, msg: 'Payin approved', payin: populated });
});
