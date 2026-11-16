import crypto from 'node:crypto';
import net from 'node:net';
import { env } from '../config/env.js';
import { RRPAY } from '../config/rrpay.js';
import { CURRENCIES, canonicalCurrency, canonicalPayType } from '../config/paymentTypes.js';
import { createSign } from '../utils/signature.js';
import { normalizeAmount, isValidAmount } from '../utils/validate.js';
import { callRrpay } from '../services/rrpayClient.js';
import Payin from '../models/Payin.js';
import Merchant from '../models/Merchant.js';
import Group from '../models/Group.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'payin.order' });

function redactPayload(payload = {}) {
  const copy = { ...payload };
  if (copy.sign) copy.sign = '[REDACTED]';
  if (copy.payEmail) copy.payEmail = '[REDACTED]';
  if (copy.payPhone) copy.payPhone = '[REDACTED]';
  if (copy.payCardNo) copy.payCardNo = '[REDACTED]';
  return copy;
}

function extractUpiId(body = {}) {
  const direct = body.upiId || body.upi || body.vpa || body.payVpa || body.payeeVpa;
  if (typeof direct === 'string' && direct.includes('@')) return direct.trim();

  const candidates = [body.payParams, body.payURL, body.payUrl, body.qrString, body.qrContent];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const text = raw.trim();
    // upi://pay?pa=merchant@bank&...
    const paMatch = text.match(/[?&]pa=([^&\s]+)/i);
    if (paMatch) {
      try {
        const pa = decodeURIComponent(paMatch[1]).trim();
        if (pa.includes('@')) return pa;
      } catch (_) {
        const pa = paMatch[1].trim();
        if (pa.includes('@')) return pa;
      }
    }
    // plain VPA-like token
    const vpaMatch = text.match(/\b[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}\b/);
    if (vpaMatch) return vpaMatch[0];
  }
  return null;
}

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

  const groupId = body.groupId ? Number(body.groupId) : null;
  const uid = body.uid ? String(body.uid) : null;

  payload.sign = createSign(payload, env.merchantSecret);

  log.info({
    event: 'rrpay.request',
    outTradeNo: payload.outTradeNo,
    amount: payload.totalAmount,
    currencyCode: payload.currencyCode,
    payType: payload.payType,
    groupId,
    uid,
  }, 'payin order request to rrpay');

  const result = await callRrpay('/payin/create', payload);

  if (result.networkError) {
    log.error({
      event: 'rrpay.network_error',
      outTradeNo: payload.outTradeNo,
      amount: payload.totalAmount,
      groupId,
      uid,
      url: result.url,
      durationMs: result.durationMs,
      err: result.error,
    }, 'rrpay request failed');
    return res.status(502).json({
      error: 'RRPay request failed',
      message: result.error.message,
      code: result.error.code,
      cause: result.error.cause,
      url: result.url,
      durationMs: result.durationMs,
      request: redactPayload(payload),
      ...(env.nodeEnv !== 'production' ? { stack: result.error.stack } : {}),
    });
  }

  let responseBody = result.body;
  let responseText = result.text;
  let upiId = null;

  if (responseBody && typeof responseBody === 'object') {
    upiId = extractUpiId(responseBody);
    if (upiId && !responseBody.upiId) {
      responseBody = { ...responseBody, upiId };
      responseText = JSON.stringify(responseBody);
    }
  }

  const responseLog = {
    event: 'rrpay.response',
    outTradeNo: payload.outTradeNo,
    amount: payload.totalAmount,
    groupId,
    uid,
    httpStatus: result.status,
    durationMs: result.durationMs,
    resultCode: responseBody?.resultCode,
    stateInfo: responseBody?.stateInfo,
    payOrderNo: responseBody?.payOrderNo,
    upiId: upiId || null,
    hasPayParams: Boolean(responseBody?.payParams),
    responseKeys: responseBody && typeof responseBody === 'object' ? Object.keys(responseBody) : null,
  };
  if (responseBody?.resultCode === '0000') log.info(responseLog, 'rrpay payin order created');
  else log.warn(responseLog, 'rrpay payin order rejected');

  // Persist a local Payin record on success so webhooks can update it.
  if (responseBody && responseBody.resultCode === '0000' && responseBody.payOrderNo) {
    try {
      let merchant = await Merchant.findOne({ merNo: env.merchantNo });
      if (!merchant && env.merchantNo && env.merchantSecret) {
        merchant = await Merchant.create({
          merNo: env.merchantNo,
          name: env.merchantName || env.merchantNo,
          secretKey: env.merchantSecret,
          status: 'active',
        });
      }
      if (merchant) {
        await Payin.create({
          payOrderNo: responseBody.payOrderNo,
          merchant: merchant._id,
          merNo: env.merchantNo,
          outTradeNo: payload.outTradeNo,
          currencyCode: payload.currencyCode,
          payType: payload.payType,
          randomNo: payload.randomNo,
          totalAmount: payload.totalAmount,
          notifyUrl: payload.notifyUrl,
          payCardNo: payload.payCardNo,
          payBankCode: payload.payBankCode,
          payName: payload.payName,
          payEmail: payload.payEmail,
          payPhone: payload.payPhone,
          payIp: payload.payIp,
          payURL: responseBody.payURL || responseBody.payUrl,
          payViewUrl: payload.payViewUrl,
          payParams: responseBody.payParams,
          upiId: upiId || undefined,
          status: 'pending',
          group: groupId ? (await Group.findOne({ groupId }))?._id : undefined,
          groupId: groupId ?? undefined,
          uid: uid ?? undefined,
          rawRequest: redactPayload(payload),
          rawResponse: responseBody,
        });
      }
      log.info({ event: 'payin.persisted', outTradeNo: payload.outTradeNo, payOrderNo: responseBody.payOrderNo, upiId: upiId || null }, 'payin record persisted');
    } catch (err) {
      log.error({ event: 'payin.persist_failed', outTradeNo: payload.outTradeNo, payOrderNo: responseBody?.payOrderNo, err }, 'failed to persist payin record');
    }
  }

  // Mirror RRPay (with enriched fields like upiId when available).
  if (responseText) {
    return res.status(result.status).type(responseBody ? 'application/json' : result.contentType).send(responseText);
  }
  return res.status(result.status).end();
});
