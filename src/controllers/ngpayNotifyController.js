import { NGPAY } from '../config/ngpay.js';
import Payin from '../models/Payin.js';
import Group from '../models/Group.js';
import Transaction from '../models/Transaction.js';
import { verifyNgpaySign } from '../services/ngpayClient.js';
import asyncHandler from '../utils/asyncHandler.js';
import { nextTransactionNo } from '../utils/orderNo.js';
import { notifyPayinSuccess } from '../bot/commands.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'ngpay.notify' });

/**
 * NGPay pay order result notification (async callback).
 *
 * NGPay POSTs the payment result to the notifyUrl configured on the order.
 * Per apidocs/ngpayapidoc.md:
 *  - Reply must be the plain string "SUCCESS", otherwise NGPay retries every
 *    minute, up to 6 times.
 *  - Verify the MD5 signature over all data fields (excluding `sign`), sorted
 *    by ASCII, appended `&key={api_key}`, uppercase. Do not hardcode field
 *    names — new fields may be added later.
 *  - Idempotency: check order status before processing to prevent duplicate
 *    execution.
 *
 * NGPay status mapping: 0=success / 1=failed / 2 and 3=pending / 99=refunded.
 *
 * On success this mirrors the RRPay payin notify flow: credit the linked
 * group ledger, record a Transaction, and send the payin success notice to
 * the Telegram group.
 */
export const handleNgpayNotify = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  // ---- FULL CALLBACK LOGGING: log the complete request body as received ----
  log.info(
    {
      event: 'ngpay.notify.received',
      ngpayCallbackFull: body, // complete callback payload from NGPay
      ngpayCallback: body,     // shorthand copy for quick filtering
      remoteIp: req.ip,
      method: req.method,
      url: req.originalUrl,
      headers: {
        'content-type': req.headers['content-type'],
        'accept-language': req.headers['accept-language'],
      },
    },
    'NGPay notify callback received (full payload logged)',
  );

  // Verify the NGPay signature.
  if (NGPAY.apiKey && body.sign) {
    const ok = verifyNgpaySign(body, NGPAY.apiKey);
    if (!ok) {
      log.warn(
        { event: 'ngpay.notify.invalid_sign', ngpayCallbackFull: body },
        'NGPay notify invalid sign',
      );
      const reply = 'FAIL';
      log.warn(
        { event: 'ngpay.notify.responded', reply, reason: 'invalid_sign' },
        'NGPay notify replying FAIL (invalid sign)',
      );
      return res.status(400).type('text/plain').send(reply);
    }
  }

  const {
    merchantNo,
    merchantOrderNo,
    orderNo,
    status,
    coinUnit,
    amount,
    productTitle,
    completedTime,
    createTime,
    transactionReference,
  } = body;

  // Find the order by system orderNo or merchant outTradeNo.
  const payin = await Payin.findOne({
    $or: [{ payOrderNo: orderNo }, { outTradeNo: merchantOrderNo }],
  });

  if (!payin) {
    log.warn(
      { event: 'ngpay.notify.unknown_order', merchantOrderNo, orderNo, ngpayCallbackFull: body },
      'NGPay notify: unknown order',
    );
    // Still acknowledge to stop retries.
    const reply = 'SUCCESS';
    log.info(
      { event: 'ngpay.notify.responded', reply, reason: 'unknown_order' },
      'NGPay notify replying SUCCESS (unknown order)',
    );
    return res.type('text/plain').send(reply);
  }

  // Idempotency: don't re-process a terminal state.
  if (payin.status === 'success' || payin.status === 'failed') {
    log.info(
      {
        event: 'ngpay.notify.already_terminal',
        payOrderNo: payin.payOrderNo,
        status: payin.status,
        ngpayCallbackFull: body,
      },
      'NGPay notify: order already in terminal state, skipping',
    );
    const reply = 'SUCCESS';
    log.info(
      { event: 'ngpay.notify.responded', reply, reason: 'already_terminal', payOrderNo: payin.payOrderNo },
      'NGPay notify replying SUCCESS (already terminal)',
    );
    return res.type('text/plain').send(reply);
  }

  payin.rawCallback = body;

  let groupChatId = payin.groupId;

  // NGPay status mapping:
  //   0 = success
  //   1 = failed
  //   2 and 3 = pending
  //   99 = refunded (after success)
  if (status === 0) {
    payin.status = 'success';
    if (completedTime) payin.paidAt = new Date(Number(completedTime));
    else if (!payin.paidAt) payin.paidAt = new Date();
    if (transactionReference) payin.utrCode = transactionReference;

    // Credit the group ledger (if linked) and record a transaction — same as RRPay.
    if (payin.group) {
      const group = await Group.findById(payin.group);
      if (group) {
        groupChatId = group.groupId;
        const payAmount = Number(payin.totalAmount?.toString?.() ?? amount);
        const current = Number(group.balance?.toString?.() ?? '0');
        group.balance = (current + payAmount).toFixed(2);
        await group.save();

        await Transaction.create({
          transactionNo: await nextTransactionNo(),
          uid: group.uid,
          groupId: group.groupId,
          amount: payin.totalAmount,
          type: 'credit',
          coType: 'payin',
          payin: payin._id,
          balanceAfter: group.balance,
          remark: `Payin ${payin.payOrderNo} confirmed by NGPay provider`,
        });
      }
    }
  } else if (status === 1) {
    payin.status = 'failed';
  } else {
    // 2, 3 (pending) or unknown -> keep pending.
    payin.status = 'pending';
  }

  await payin.save();

  log.info(
    {
      event: 'ngpay.notify.updated',
      payOrderNo: payin.payOrderNo,
      merchantOrderNo,
      orderNo,
      status: payin.status,
      providerStatus: status,
      ngpayCallbackFull: body,
    },
    'NGPay order status updated',
  );

  // Send the payin success notice to the Telegram group (same as RRPay).
  if (payin.status === 'success') {
    await notifyPayinSuccess({
      orderId: payin.payOrderNo,
      amount: payin.deeplinkAmount || payin.totalAmount?.toString?.() || amount,
      groupId: groupChatId,
    });
  }

  const reply = 'SUCCESS';
  log.info(
    {
      event: 'ngpay.notify.responded',
      reply,
      payOrderNo: payin.payOrderNo,
      status: payin.status,
    },
    'NGPay notify replying SUCCESS',
  );

  return res.type('text/plain').send(reply);
});
