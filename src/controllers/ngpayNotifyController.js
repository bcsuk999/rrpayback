import { NGPAY } from '../config/ngpay.js';
import Payin from '../models/Payin.js';
import { verifyNgpaySign } from '../services/ngpayClient.js';
import asyncHandler from '../utils/asyncHandler.js';
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
 */
export const handleNgpayNotify = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  log.info({ event: 'ngpay.notify.received', ngpayCallback: body }, 'NGPay notify callback received');

  // Verify the NGPay signature.
  if (NGPAY.apiKey && body.sign) {
    const ok = verifyNgpaySign(body, NGPAY.apiKey);
    if (!ok) {
      log.warn({ event: 'ngpay.notify.invalid_sign', body }, 'NGPay notify invalid sign');
      return res.status(400).type('text/plain').send('FAIL');
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
      { event: 'ngpay.notify.unknown_order', merchantOrderNo, orderNo },
      'NGPay notify: unknown order',
    );
    // Still acknowledge to stop retries.
    return res.type('text/plain').send('SUCCESS');
  }

  // Idempotency: don't re-process a terminal state.
  if (payin.status === 'success' || payin.status === 'failed') {
    return res.type('text/plain').send('SUCCESS');
  }

  payin.rawCallback = body;

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
  } else if (status === 1) {
    payin.status = 'failed';
  } else {
    // 2, 3 (pending) or unknown -> keep pending.
    payin.status = 'pending';
  }

  await payin.save();

  log.info(
    { event: 'ngpay.notify.updated', payOrderNo: payin.payOrderNo, status: payin.status },
    'NGPay order status updated',
  );

  return res.type('text/plain').send('SUCCESS');
});
