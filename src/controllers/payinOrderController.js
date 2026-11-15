import crypto from 'node:crypto';
import net from 'node:net';
import { env } from '../config/env.js';
import { RRPAY } from '../config/rrpay.js';
import { CURRENCIES, canonicalCurrency, canonicalPayType } from '../config/paymentTypes.js';
import { createSign } from '../utils/signature.js';
import { normalizeAmount, isValidAmount } from '../utils/validate.js';
import { callRrpay } from '../services/rrpayClient.js';
import asyncHandler from '../utils/asyncHandler.js';

const DEFAULTS = {
  payCardNo: '123456', // doc: fixed value allowed when you have no real account
  payBankCode: 'PAY', // doc: fixed value allowed when no real encoding
  payName: 'xiaoming',
  payEmail: 'xiaoming@email.com',
  payPhone: '+917123456789',
};

function randomDigits(length) {
  let value = '';
  for (let i = 0; i < length; i += 1) value += crypto.randomInt(0, 10);
  return value;
}

function newOutTradeNo() {
  const now = new Date();
  const stamp = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `PI${stamp}${randomDigits(4)}`; // 18 chars, under the 20 limit
}

function isPublicIp(ip) {
  if (!net.isIP(ip)) return false;
  if (ip === '::1' || ip === '0.0.0.0' || ip.startsWith('127.')) return false;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return false;
  if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return false;

  const private172 = ip.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;

  return true;
}

function payerIp(req, override) {
  const candidates = [override, String(req.ip ?? '').replace(/^::ffff:/, ''), RRPAY.payIp];
  return candidates.find((ip) => ip && isPublicIp(String(ip))) ?? RRPAY.payIp;
}

/**
 * POST /payin/order
 * Body: { "amount": "150.00" } plus optional overrides (currencyCode, payType, notifyUrl,
 * payViewUrl, payName, payEmail, payPhone, payIp, payCardNo, payBankCode).
 * Builds the full RRPay /payin/create payload (sign included) and returns RRPay's exact response.
 */
export const createPayinOrder = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  if (!env.merchantNo || !env.merchantSecret) {
    return res.status(500).json({
      error: 'Merchant credentials missing',
      detail: 'Set MERCHANT_NO and MERCHANT_SECRET in .env',
    });
  }

  if (body.amount === undefined || body.amount === null || String(body.amount).trim() === '') {
    return res.status(400).json({
      error: 'amount is required',
      example: { amount: '150.00' },
    });
  }

  if (!isValidAmount(body.amount)) {
    return res.status(400).json({
      error: 'Invalid amount',
      received: body.amount,
      expected: 'positive number, max 2 decimals, max 9 characters (e.g. 150.00)',
    });
  }

  const currencyCode = canonicalCurrency(body.currencyCode ?? RRPAY.currencyCode);
  if (!currencyCode) {
    return res.status(400).json({
      error: 'Invalid currencyCode',
      received: body.currencyCode,
      supported: Object.keys(CURRENCIES),
    });
  }

  const payType = canonicalPayType(currencyCode, body.payType ?? RRPAY.payType);
  if (!payType) {
    return res.status(400).json({
      error: 'Invalid payType',
      received: body.payType,
      currencyCode,
      supported: CURRENCIES[currencyCode],
    });
  }

  const payload = {
    merNo: env.merchantNo,
    currencyCode,
    payType,
    randomNo: randomDigits(14),
    outTradeNo: newOutTradeNo(),
    totalAmount: normalizeAmount(body.amount),
    notifyUrl: body.notifyUrl ?? RRPAY.notifyUrl,
    payCardNo: body.payCardNo ?? DEFAULTS.payCardNo,
    payBankCode: body.payBankCode ?? DEFAULTS.payBankCode,
    payName: body.payName ?? DEFAULTS.payName,
    payEmail: body.payEmail ?? DEFAULTS.payEmail,
    payPhone: body.payPhone ?? DEFAULTS.payPhone,
    payIp: payerIp(req, body.payIp),
  };

  if (body.payViewUrl) payload.payViewUrl = body.payViewUrl;

  payload.sign = createSign(payload, env.merchantSecret);

  const result = await callRrpay('/payin/create', payload);

  if (result.networkError) {
    return res.status(502).json({
      error: 'RRPay request failed',
      message: result.error.message,
      code: result.error.code,
      cause: result.error.cause,
      url: result.url,
      durationMs: result.durationMs,
      request: payload,
      ...(env.nodeEnv !== 'production' ? { stack: result.error.stack } : {}),
    });
  }

  // Mirror RRPay exactly: same status code, same content type, same body bytes.
  if (result.text) {
    return res.status(result.status).type(result.contentType).send(result.text);
  }
  return res.status(result.status).end();
});
