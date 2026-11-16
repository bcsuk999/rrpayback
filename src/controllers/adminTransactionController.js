import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import asyncHandler from '../utils/asyncHandler.js';

const Decimal128 = mongoose.Types.Decimal128;

function parseDate(value, endOfDay = false) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

function toDecimal(value) {
  const v = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
  try {
    return Decimal128.fromString(v);
  } catch {
    return null;
  }
}

export const listTransactions = asyncHandler(async (req, res) => {
  const requestedPage = Number(req.query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(200, requestedLimit)
    : 20;
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.query.uid) filter.uid = String(req.query.uid).trim();
  if (req.query.groupId !== undefined && req.query.groupId !== '') {
    const n = Number(req.query.groupId);
    if (Number.isFinite(n)) filter.groupId = n;
  }
  if (req.query.type) {
    const type = String(req.query.type).trim();
    if (['credit', 'debit'].includes(type)) filter.type = type;
  }
  if (req.query.coType) filter.coType = String(req.query.coType).trim();
  if (req.query.payin && /^[0-9a-fA-F]{24}$/.test(String(req.query.payin))) {
    filter.payin = String(req.query.payin);
  }

  // Date filters (single day or range)
  const day = req.query.date;
  const createdFrom = parseDate(req.query.createdFrom || req.query.from || day);
  const createdTo = parseDate(req.query.createdTo || req.query.to || day, true);
  if (createdFrom || createdTo) {
    filter.createdAt = {};
    if (createdFrom) filter.createdAt.$gte = createdFrom;
    if (createdTo) filter.createdAt.$lte = createdTo;
  }

  // Amount range
  const amountFrom = toDecimal(req.query.amountFrom ?? req.query.minAmount);
  const amountTo = toDecimal(req.query.amountTo ?? req.query.maxAmount);
  if (amountFrom || amountTo) {
    filter.amount = {};
    if (amountFrom) filter.amount.$gte = amountFrom;
    if (amountTo) filter.amount.$lte = amountTo;
  }

  const includeTotal = String(req.query.includeTotal ?? 'true').toLowerCase() !== 'false';

  const transactionsQuery = Transaction.find(filter)
    .select('uid groupId amount type coType payin remark balanceAfter createdAt updatedAt')
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .populate('payin', 'payOrderNo status')
    .lean();

  const [transactions, total] = await Promise.all([
    transactionsQuery,
    includeTotal ? Transaction.countDocuments(filter) : Promise.resolve(null),
  ]);

  return res.json({
    success: true,
    page,
    limit,
    ...(includeTotal ? { total, totalPages: Math.ceil(total / limit) } : {}),
    hasMore: transactions.length === limit,
    transactions,
  });
});
