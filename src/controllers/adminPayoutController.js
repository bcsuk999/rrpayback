import mongoose from 'mongoose';
import Payout from '../models/Payout.js';
import Group from '../models/Group.js';
import Transaction from '../models/Transaction.js';
import asyncHandler from '../utils/asyncHandler.js';
import { nextPayOrderNo } from '../utils/orderNo.js';
import { createSign } from '../utils/signature.js';
import { callRrpay } from '../services/rrpayClient.js';
import { env } from '../config/env.js';
import {
  normalizeAmount,
  isValidAmount,
  isValidEmail,
  isValidPhone,
  isValidHttpUrl,
} from '../utils/validate.js';

const Decimal128 = mongoose.Types.Decimal128;

const ALLOWED_BANK_CODES = ['IMPS', 'UPI'];

/** 14-digit random number for RRPAY randomNo. */
function randomNo() {
  return String(Math.floor(10000000000000 + Math.random() * 90000000000000));
}

/** RRPAY result codes that mean the order was accepted/submitted to the bank. */
const ACCEPTED_CODES = new Set(['0000', 'E0001', 'E0002', 'E0003']);
/** RRPAY result codes that allow an immediate refund (order not submitted to bank). */
const HARD_REJECT_CODES = new Set(['9999', '99']);

export const createPayout = asyncHandler(async (req, res) => {
  if (!env.merchantNo || !env.merchantSecret) {
    return res.status(500).json({
      success: false,
      msg: 'Payout gateway is not configured (MERCHANT_NO / MERCHANT_SECRET missing)',
    });
  }

  const body = req.body ?? {};

  // ---- Resolve the group to debit ----
  let group;
  if (body.groupId !== undefined && body.groupId !== '') {
    group = await Group.findOne({ groupId: Number(body.groupId) }).lean();
  } else if (body.uid) {
    group = await Group.findOne({ uid: String(body.uid).trim() }).lean();
  }
  if (!group) {
    return res.status(404).json({ success: false, msg: 'Group not found' });
  }

  // ---- Amount ----
  const amountStr = normalizeAmount(body.amount ?? '');
  if (!amountStr) {
    return res.status(400).json({
      success: false,
      msg: 'amount must be a positive number with up to 2 decimals',
    });
  }
  if (Number(amountStr) <= 0) {
    return res.status(400).json({ success: false, msg: 'amount must be greater than 0' });
  }
  const amount = Number(amountStr);
  const currentBalance = Number(group.balance?.toString?.() ?? '0');
  if (currentBalance < amount) {
    return res.status(400).json({ success: false, msg: 'Insufficient balance for payout' });
  }

  // ---- Currency ----
  const currencyCode = String(body.currencyCode ?? env.currencyCode ?? 'INR')
    .trim()
    .toUpperCase();

  // ---- Bank code / identity type ----
  const bankCode = String(body.bankCode ?? '').trim().toUpperCase();
  const identityType = String(body.identityType ?? '').trim().toUpperCase();
  if (!ALLOWED_BANK_CODES.includes(bankCode)) {
    return res.status(400).json({
      success: false,
      msg: 'bankCode must be IMPS (bank card) or UPI',
    });
  }
  if (identityType !== bankCode) {
    return res.status(400).json({
      success: false,
      msg: 'identityType must match bankCode (IMPS or UPI)',
    });
  }

  // ---- Recipient name: bankAcctName XOR bankFirstName+bankLastName ----
  const bankAcctName = body.bankAcctName ? String(body.bankAcctName).trim() : null;
  const bankFirstName = body.bankFirstName ? String(body.bankFirstName).trim() : null;
  const bankLastName = body.bankLastName ? String(body.bankLastName).trim() : null;

  if (bankAcctName && (bankFirstName || bankLastName)) {
    return res.status(400).json({
      success: false,
      msg: 'Provide either bankAcctName or bankFirstName+bankLastName, not both',
    });
  }
  if (!bankAcctName && !(bankFirstName && bankLastName)) {
    return res.status(400).json({
      success: false,
      msg: 'bankAcctName or bankFirstName+bankLastName is required',
    });
  }

  const bankAcctNo = String(body.bankAcctNo ?? '').trim();
  const accPhone = String(body.accPhone ?? '').trim();
  const accEmail = String(body.accEmail ?? '').trim();
  const identityNo = String(body.identityNo ?? '').trim();

  if (!bankAcctNo) {
    return res.status(400).json({ success: false, msg: 'bankAcctNo is required' });
  }
  if (!accPhone) {
    return res.status(400).json({ success: false, msg: 'accPhone is required' });
  }
  if (!accEmail) {
    return res.status(400).json({ success: false, msg: 'accEmail is required' });
  }
  if (!identityNo) {
    return res.status(400).json({ success: false, msg: 'identityNo is required' });
  }
  if (!isValidEmail(accEmail)) {
    return res.status(400).json({ success: false, msg: 'Invalid accEmail' });
  }
  if (!isValidPhone(accPhone, currencyCode)) {
    return res.status(400).json({ success: false, msg: 'Invalid accPhone' });
  }

  // ---- Notify URL ----
  const notifyUrl = String(body.notifyUrl ?? env.rrpayPayoutNotifyUrl ?? '')
    .trim();
  if (!notifyUrl || !isValidHttpUrl(notifyUrl)) {
    return res.status(400).json({
      success: false,
      msg: 'notifyUrl is required and must be a valid http(s) URL',
    });
  }

  // ---- Build RRPAY request ----
  const outTradeNo = await nextPayOrderNo('PO');
  const reqTimeStamp = String(Date.now());

  const payload = {
    merNo: env.merchantNo,
    randomNo: randomNo(),
    currencyCode,
    totalAmount: amountStr,
    outTradeNo,
    reqTimeStamp,
    bankCode,
    bankAcctName,
    bankFirstName,
    bankLastName,
    bankAcctNo,
    accPhone,
    accEmail,
    notifyUrl,
    identityNo,
    identityType,
  };

  // Drop empty values (they do not participate in the signature) then sign.
  const cleanPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null && value !== '') {
      cleanPayload[key] = value;
    }
  }
  cleanPayload.sign = createSign(cleanPayload, env.merchantSecret);

  // ---- Call RRPAY ----
  const result = await callRrpay('/cashOutExc/create', cleanPayload);
  const responseBody = result.body ?? {};

  if (result.networkError || !result.ok) {
    return res.status(502).json({
      success: false,
      msg: 'Payout gateway unreachable — order not created',
      error: result.error ? result.error.message : null,
      status: result.status,
      rawResponse: responseBody,
    });
  }

  const resultCode = String(responseBody.resultCode ?? '');
  const resultMsg = String(responseBody.resultMsg ?? '');
  const isAccepted = ACCEPTED_CODES.has(resultCode);
  const isHardReject = HARD_REJECT_CODES.has(resultCode);

  let debited = false;
  let payout = null;

  if (isAccepted) {
    // Debit the group balance atomically (funds leave on submission).
    const updatedGroup = await Group.findOneAndUpdate(
      { _id: group._id, balance: { $gte: Decimal128.fromString(amountStr) } },
      { $inc: { balance: Decimal128.fromString(`-${amountStr}`) } },
      { new: true, projection: 'uid groupId balance' }
    ).lean();

    if (!updatedGroup) {
      return res.status(400).json({
        success: false,
        msg: 'Insufficient balance for payout (concurrent update)',
      });
    }
    debited = true;

    // Record the payout order.
    payout = await Payout.create({
      payoutOrderNo: outTradeNo,
      outTradeNo,
      remitOrderNo: resultCode === '0000' ? responseBody.remitOrderNo : null,
      uid: updatedGroup.uid,
      groupId: updatedGroup.groupId,
      amount: Decimal128.fromString(amountStr),
      currencyCode,
      bankCode,
      identityType,
      bankAcctNo,
      bankAcctName,
      bankFirstName,
      bankLastName,
      accPhone,
      accEmail,
      identityNo,
      notifyUrl,
      state: 'submitted',
      remitState: null,
      rawRequest: cleanPayload,
      rawResponse: responseBody,
      remark: String(body.remark ?? '').trim() || `RRPAY payout ${outTradeNo}`,
    });

    // Ledger entry (debit).
    await Transaction.create({
      transactionNo: await nextPayOrderNo('TRN'),
      uid: updatedGroup.uid,
      groupId: updatedGroup.groupId,
      amount: Decimal128.fromString(amountStr),
      type: 'debit',
      coType: 'payout',
      payout: payout._id,
      payoutState: payout.state,
      balanceAfter: updatedGroup.balance,
      remark: `RRPAY payout ${outTradeNo} (${resultCode})`,
    });

    return res.status(201).json({
      success: true,
      msg: 'Payout order created',
      debited: true,
      payoutOrderNo: payout.payoutOrderNo,
      outTradeNo: payout.outTradeNo,
      remitOrderNo: payout.remitOrderNo || null,
      resultCode,
      resultMsg,
      state: payout.state,
      group: {
        uid: updatedGroup.uid,
        groupId: updatedGroup.groupId,
        balance: updatedGroup.balance,
      },
      rrpay: responseBody,
    });
  }

  // Hard reject (9999 / 99) — order not submitted to bank, no debit.
  payout = await Payout.create({
    payoutOrderNo: outTradeNo,
    outTradeNo,
    uid: group.uid,
    groupId: group.groupId,
    amount: Decimal128.fromString(amountStr),
    currencyCode,
    bankCode,
    identityType,
    bankAcctNo,
    bankAcctName,
    bankFirstName,
    bankLastName,
    accPhone,
    accEmail,
    identityNo,
    notifyUrl,
    state: 'rejected',
    remitState: null,
    rawRequest: cleanPayload,
    rawResponse: responseBody,
    remark: String(body.remark ?? '').trim() || `RRPAY payout ${outTradeNo} rejected`,
  });

  return res.status(400).json({
    success: false,
    msg: `Payout rejected by gateway: ${resultMsg || resultCode}`,
    resultCode,
    resultMsg,
    payoutOrderNo: payout.payoutOrderNo,
    outTradeNo: payout.outTradeNo,
    rrpay: responseBody,
  });
});
