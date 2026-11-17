import { createNgpayOrder } from '../services/ngpayClient.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * GET /api/test/ngpay/:amount
 * Test-only endpoint: creates an NGPay order of the given amount (e.g. /api/test/ngpay/1000)
 * and returns the gateway response so the payUrl/orderNo can be verified.
 *
 * Later, when products are integrated, this is replaced by the real order flow
 * and the gateway (ngpay / rrpay) is selected from the admin setting.
 */
export const createNgpayTestOrder = asyncHandler(async (req, res) => {
  const { amount } = req.params;
  const merchantOrderNo = `TEST_NGPAY_${Date.now()}`;
  const clientIp = String(req.ip ?? '').replace(/^::ffff:/, '') || '127.0.0.1';

  const result = await createNgpayOrder({ amount, merchantOrderNo, clientIp });

  if (result.networkError) {
    return res.status(502).json({
      ok: false,
      gateway: 'ngpay',
      error: 'NGPay request failed',
      message: result.error.message,
      code: result.error.code,
      cause: result.error.cause,
      url: result.url,
      amount,
      merchantOrderNo,
    });
  }

  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      gateway: 'ngpay',
      error: 'NGPay order creation failed',
      status: result.status,
      statusText: result.statusText,
      amount,
      merchantOrderNo,
      gatewayResponse: result.body,
      raw: result.text,
    });
  }

  return res.status(200).json({
    ok: true,
    gateway: 'ngpay',
    amount,
    merchantOrderNo,
    data: result.body,
  });
});
