import { env } from '../config/env.js';
import Payin from '../models/Payin.js';
import Group from '../models/Group.js';
import Transaction from '../models/Transaction.js';
import { createSign, verifySign } from '../utils/signature.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * RRPay payin result notification (async callback).
 * RRPay POSTs the payment result to our notifyUrl; we must reply the plain
 * string "SUCCESS" once we have processed (and verified) it.
 */
export const handlePayinNotify = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  // Verify the merchant signature. RRPay signs every callback.
  if (env.merchantSecret && body.sign) {
    const ok = verifySign(body, env.merchantSecret);
    if (!ok) {
      console.warn('[payin/notify] invalid sign', body);
      // Still acknowledge to avoid endless retries? Reply 400 instead.
      return res.status(400).type('text/plain').send('FAIL');
    }
  }

  const { payOrderNo, outTradeNo, payState, totalAmount, payDate, utrCode } = body;

  const payin = await Payin.findOne({ payOrderNo });
  if (!payin) {
    console.warn('[payin/notify] unknown payOrderNo', payOrderNo);
    return res.type('text/plain').send('SUCCESS');
  }

  // Idempotency: don't re-process a terminal state.
  if (payin.status === 'success' || payin.status === 'failed') {
    return res.type('text/plain').send('SUCCESS');
  }

  payin.payState = payState;
  if (payDate) payin.paidAt = new Date(String(payDate).replace(' ', 'T'));
  if (utrCode) payin.utrCode = utrCode;
  payin.rawCallback = body;

  if (payState === '0000') {
    payin.status = 'success';
    if (!payin.paidAt) payin.paidAt = new Date();

    // Credit the group ledger (if linked) and record a transaction.
    if (payin.group) {
      const group = await Group.findById(payin.group);
      if (group) {
        const amount = Number(payin.totalAmount?.toString?.() ?? totalAmount);
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
  } else if (payState === '0011') {
    payin.status = 'failed';
  } else {
    // 0099 (unpaid) or unknown -> keep pending.
    payin.status = 'pending';
  }

  await payin.save();

  return res.type('text/plain').send('SUCCESS');
});
