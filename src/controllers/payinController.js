import Merchant from '../models/Merchant.js';
import Payin from '../models/Payin.js';
import { env } from '../config/env.js';
import { canonicalCurrency, canonicalPayType } from '../config/paymentTypes.js';
import { createSign, verifySign } from '../utils/signature.js';
import { nextPayOrderNo } from '../utils/orderNo.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  firstMissing,
  firstTooLong,
  normalizeAmount,
  isValidAmount,
  isValidEmail,
  isValidPhone,
  isValidHttpUrl,
  isValidPayerIp,
} from '../utils/validate.js';

const REQUIRED_FIELDS = [
  'merNo',
  'currencyCode',
  'payType',
  'randomNo',
  'outTradeNo',
  'totalAmount',
  'notifyUrl',
  'sign',
  'payCardNo',
  'payBankCode',
  'payName',
  'payEmail',
  'payPhone',
  'payIp',
];

const OPTIONAL_FIELDS = ['payViewUrl'];

/** Sends a gateway-style JSON reply, signed when the merchant secret is known. */
function reply(res, secret, payload) {
  const body = { ...payload };
  if (secret) body.sign = createSign(body, secret);
  return res.status(200).json(body);
}

export const createPayin = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  const missing = firstMissing(body, REQUIRED_FIELDS);
  if (missing) return reply(res, null, { resultCode: '9999', stateInfo: `Missing parameters ${missing}!` });

  const merchant = await Merchant.findOne({ merNo: String(body.merNo).trim() });
  if (!merchant) return reply(res, null, { resultCode: '9999', stateInfo: 'Invalid merNo' });

  const secret = merchant.secretKey;
  if (merchant.status !== 'active') {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Merchant disabled' });
  }
  if (!verifySign(body, secret)) {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid sign' });
  }

  const tooLong = firstTooLong(body, [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
  if (tooLong) return reply(res, secret, { resultCode: '9999', stateInfo: `Invalid length ${tooLong}!` });

  const currencyCode = canonicalCurrency(body.currencyCode);
  if (!currencyCode) return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid currencyCode!' });

  const payType = canonicalPayType(currencyCode, body.payType);
  if (!payType) return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid payType!' });

  if (!isValidAmount(body.totalAmount)) {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid totalAmount!' });
  }
  if (!isValidHttpUrl(String(body.notifyUrl).trim())) {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid notifyUrl!' });
  }
  if (body.payViewUrl && !isValidHttpUrl(String(body.payViewUrl).trim())) {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid payViewUrl!' });
  }
  if (!isValidEmail(String(body.payEmail).trim())) {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid payEmail!' });
  }
  if (!isValidPhone(String(body.payPhone).trim(), currencyCode)) {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid payPhone!' });
  }
  if (!isValidPayerIp(String(body.payIp).trim())) {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Invalid pay IP!' });
  }

  const outTradeNo = String(body.outTradeNo).trim();
  const existing = await Payin.exists({ merNo: merchant.merNo, outTradeNo });
  if (existing) {
    return reply(res, secret, { resultCode: '9999', stateInfo: 'Duplicate outTradeNo!' });
  }

  const payOrderNo = await nextPayOrderNo();
  const totalAmount = normalizeAmount(body.totalAmount);

  let payin;
  try {
    payin = await Payin.create({
      payOrderNo,
      merchant: merchant._id,
      merNo: merchant.merNo,
      outTradeNo,
      currencyCode,
      payType,
      randomNo: String(body.randomNo).trim(),
      totalAmount,
      notifyUrl: String(body.notifyUrl).trim(),
      payViewUrl: body.payViewUrl ? String(body.payViewUrl).trim() : undefined,
      payCardNo: String(body.payCardNo).trim(),
      payBankCode: String(body.payBankCode).trim(),
      payName: String(body.payName).trim(),
      payEmail: String(body.payEmail).trim(),
      payPhone: String(body.payPhone).trim(),
      payIp: String(body.payIp).trim(),
      payURL: `${env.payUrlBase}/${payOrderNo}`,
      rawRequest: body,
    });
  } catch (error) {
    // Unique index { merNo, outTradeNo } guards against concurrent duplicates.
    if (error?.code === 11000) {
      return reply(res, secret, { resultCode: '9999', stateInfo: 'Duplicate outTradeNo!' });
    }
    throw error;
  }

  return reply(res, secret, {
    resultCode: '0000',
    stateInfo: 'success',
    merNo: payin.merNo,
    outTradeNo: payin.outTradeNo,
    totalAmount: payin.totalAmount.toString(),
    payURL: payin.payURL,
    payOrderNo: payin.payOrderNo,
  });
});

// Dev-only helper for Swagger UI: computes the sign for an unsigned body.
export const signPayinRequest = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  if (!body.merNo) return res.status(400).json({ error: 'merNo is required' });

  const merchant = await Merchant.findOne({ merNo: String(body.merNo).trim() });
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

  return res.json({ sign: createSign(body, merchant.secretKey) });
});

export const getPayPage = asyncHandler(async (req, res) => {
  const payin = await Payin.findOne({ payOrderNo: req.params.payOrderNo }).lean();
  if (!payin) return res.status(404).json({ error: 'Payment order not found' });

  return res.json({
    payOrderNo: payin.payOrderNo,
    merNo: payin.merNo,
    outTradeNo: payin.outTradeNo,
    totalAmount: payin.totalAmount?.toString(),
    currencyCode: payin.currencyCode,
    payType: payin.payType,
    status: payin.status,
    createdAt: payin.createdAt,
    // TODO: render the real payment page / channel integration here.
  });
});
