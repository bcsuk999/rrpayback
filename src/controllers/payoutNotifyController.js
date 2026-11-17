import mongoose from 'mongoose';
import { env } from '../config/env.js';
import Payout from '../models/Payout.js';
import Group from '../models/Group.js';
import Transaction from '../models/Transaction.js';
import { verifySign } from '../utils/signature.js';
import asyncHandler from '../utils/asyncHandler.js';
import { nextTransactionNo } from '../utils/orderNo.js';
import { normalizeAmount } from '../utils/validate.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'payout.notify' });

const REMIT_STATES = {
  SUCCESS: '00',
  FAILED: new Set(['02', '12']),
  UNCLEAR: '11',
  CANCELLED: '13',
  FAILED_REFUNDED: '1000',
};

const TERMINAL_PAYOUT_STATES = new Set([
  'success',
  'failed',
  'cancelled',
  'failed_refunded',
  'rejected',
]);

function getPayoutOutcome(remitState) {
  if (remitState === REMIT_STATES.SUCCESS) {
    return { state: 'success', shouldRefund: false };
  }
  if (REMIT_STATES.FAILED.has(remitState)) {
    return { state: 'failed', shouldRefund: true };
  }
  if (remitState === REMIT_STATES.CANCELLED) {
    return { state: 'cancelled', shouldRefund: true };
  }
  if (remitState === REMIT_STATES.FAILED_REFUNDED) {
    return { state: 'failed_refunded', shouldRefund: true };
  }
  if (remitState === REMIT_STATES.UNCLEAR) {
    return { state: 'unclear', shouldRefund: false };
  }
  return null;
}

function parseRemitDate(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

export const handlePayoutNotify = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  if (!env.merchantSecret) {
    log.error({ event: 'payout.notify.missing_secret' }, 'RRPAY payout callback cannot be verified');
    return res.status(500).type('text/plain').send('FAIL');
  }
  if (!verifySign(body, env.merchantSecret)) {
    log.warn({ event: 'payout.notify.invalid_signature' }, 'Invalid RRPAY payout callback signature');
    return res.status(400).type('text/plain').send('FAIL');
  }

  const outTradeNo = String(body.outTradeNo ?? '').trim();
  const remitState = String(body.remitState ?? '').trim();
  if (
    !outTradeNo ||
    !remitState ||
    body.totalAmount === undefined ||
    !env.merchantNo ||
    String(body.merNo ?? '') !== env.merchantNo
  ) {
    log.warn({ event: 'payout.notify.invalid_payload', outTradeNo, remitState });
    return res.status(400).type('text/plain').send('FAIL');
  }

  const callbackAmount = body.totalAmount === undefined
    ? null
    : normalizeAmount(body.totalAmount);
  if (body.totalAmount !== undefined && !callbackAmount) {
    log.warn({ event: 'payout.notify.invalid_amount', outTradeNo });
    return res.status(400).type('text/plain').send('FAIL');
  }

  const session = await mongoose.startSession();
  let payoutFound = false;
  let updated = false;
  let outcome = null;
  let balanceAfter = null;
  let amountMismatch = false;

  try {
    await session.withTransaction(async () => {
      payoutFound = false;
      updated = false;
      outcome = null;
      balanceAfter = null;
      amountMismatch = false;

      const payout = await Payout.findOne({ outTradeNo }).session(session);
      if (!payout) return;

      payoutFound = true;
      if (TERMINAL_PAYOUT_STATES.has(payout.state)) {
        await Transaction.updateMany(
          { payout: payout._id, type: 'debit', coType: 'payout' },
          { $set: { payoutState: payout.state } },
          { session },
        );
        return;
      }

      const storedAmount = normalizeAmount(payout.amount.toString());
      if (callbackAmount && callbackAmount !== storedAmount) {
        amountMismatch = true;
        return;
      }

      outcome = getPayoutOutcome(remitState);
      const remitDate = parseRemitDate(body.remitData ?? body.remitDate);
      const update = {
        remitOrderNo: body.remitOrderNo === undefined ? payout.remitOrderNo : String(body.remitOrderNo),
        remitState,
        orderMessage: body.orderMessage === undefined ? payout.orderMessage : String(body.orderMessage),
        utrCode: body.utrCode ? String(body.utrCode) : payout.utrCode,
        remitDate: remitDate ?? payout.remitDate,
        rawResponse: body,
      };

      if (outcome) {
        update.state = outcome.state;
        await Transaction.updateMany(
          { payout: payout._id, type: 'debit', coType: 'payout' },
          { $set: { payoutState: outcome.state } },
          { session },
        );
      }

      if (outcome?.shouldRefund) {
        const group = await Group.findOneAndUpdate(
          { groupId: payout.groupId },
          { $inc: { balance: payout.amount } },
          { new: true, session, projection: 'uid groupId balance' },
        ).lean();

        if (!group) {
          throw new Error(`Group ${payout.groupId} not found for payout ${outTradeNo} refund`);
        }

        balanceAfter = group.balance;
        await Transaction.create([{
          transactionNo: await nextTransactionNo(),
          uid: group.uid,
          groupId: group.groupId,
          amount: payout.amount,
          type: 'credit',
          coType: 'payout',
          payout: payout._id,
          balanceAfter: group.balance,
          remark: `Payout ${outTradeNo} refunded (remitState ${remitState})`,
        }], { session });
      }

      Object.assign(payout, update);
      await payout.save({ session });
      updated = true;
    });
  } finally {
    await session.endSession();
  }

  if (!payoutFound) {
    log.warn({ event: 'payout.notify.unknown_order', outTradeNo });
    return res.status(404).type('text/plain').send('FAIL');
  }
  if (amountMismatch) {
    log.warn({ event: 'payout.notify.amount_mismatch', outTradeNo });
    return res.status(400).type('text/plain').send('FAIL');
  }

  if (!updated) {
    return res.type('text/plain').send('SUCCESS');
  }

  log.info({
    event: 'payout.notify.processed',
    outTradeNo,
    remitState,
    state: outcome?.state ?? 'unchanged',
    refunded: Boolean(outcome?.shouldRefund),
    balanceAfter: balanceAfter?.toString(),
  }, 'RRPAY payout callback processed');

  return res.type('text/plain').send('SUCCESS');
});
