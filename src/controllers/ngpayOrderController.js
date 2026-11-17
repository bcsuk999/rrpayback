import {
  createNgpayOrder as createNgpayGatewayOrder,
  getNgpayOrderDetail,
  extractUpiFromIframeUrl,
  extractUpiFromIframe,
} from '../services/ngpayClient.js';
import { NGPAY } from '../config/ngpay.js';
import { env } from '../config/env.js';
import { extractUpiFromPayUrl, parseUpiDeeplink, extractUpiFromIframe as extractUpiFromIframeAlt } from '../services/upiExtractor.js';
import Payin from '../models/Payin.js';
import Merchant from '../models/Merchant.js';
import Group from '../models/Group.js';
import Gateway from '../models/Gateway.js';
import { nextPayOrderNo } from '../utils/orderNo.js';
import asyncHandler from '../utils/asyncHandler.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'ngpay.order' });

/**
 * POST /api/ngpay/order
 * Create an NGPay pay order (same shape as /payin/order but for the NGPay gateway).
 * Body: { amount, groupId, uid, notifyUrl, viewUrl, clientIp, payType, coinUnit }
 */
export const createNgpayOrder = asyncHandler(async (req, res) => {
  const body = req.body ?? {};

  // Only active gateways are used to create orders.
  const ngpayGateway = await Gateway.findOne({ name: 'ngpay' }).lean();
  if (!ngpayGateway || ngpayGateway.status !== 'active') {
    return res.status(403).json({
      error: 'Gateway inactive',
      msg: 'NGPay gateway is not active. Enable it from admin to create orders.',
    });
  }

  if (!NGPAY.baseUrl || !NGPAY.apiKey || !NGPAY.merchantNo || !NGPAY.productNo) {
    return res.status(500).json({
      error: 'NGPay credentials missing',
      detail: 'Set NGPAY_BASE_URL, NGPAY_API_KEY, NGPAY_MERCHANT_NO and NGPAY_PRODUCT_NO in .env',
    });
  }

  if (!body.amount || String(body.amount).trim() === '') {
    return res.status(400).json({
      error: 'amount is required',
      example: { amount: '150.00' },
    });
  }

  const normalized = Number(body.amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return res.status(400).json({ error: 'Invalid amount', received: body.amount });
  }

  const merchantOrderNo = await nextPayOrderNo('NGOR');
  const clientIp = String(req.ip ?? '').replace(/^::ffff:/, '') || '127.0.0.1';

  const result = await createNgpayGatewayOrder({
    amount: body.amount,
    merchantOrderNo,
    clientIp: body.clientIp || clientIp,
    payType: body.payType || ngpayGateway.payType || NGPAY.payType,
  });

  if (result.networkError) {
    log.error({
      event: 'ngpay.network_error',
      merchantOrderNo,
      amount: body.amount,
      err: result.error,
    }, 'ngpay order request failed');
    return res.status(502).json({
      error: 'NGPay request failed',
      message: result.error.message,
      code: result.error.code,
      cause: result.error.cause,
    });
  }

  if (!result.ok) {
    return res.status(result.status).json({
      error: 'NGPay order creation failed',
      status: result.status,
      statusText: result.statusText,
      gatewayResponse: result.body,
    });
  }

  // NGPay wraps response as { code, msg, data: {...} }
  // Check business code (HTTP 200 can still carry code 500)
  const ngpayData = result.body?.data ?? null;
  if (result.body?.code !== 200 || !ngpayData) {
    return res.status(500).json({
      error: 'NGPay order creation failed',
      code: result.body?.code,
      msg: result.body?.msg,
      gatewayResponse: result.body,
    });
  }

  const orderNo = ngpayData.orderNo;
  const payUrl = ngpayData.payUrl || ngpayData.payURL || '';
  const payContent = ngpayData.payContent || '';

  if (!orderNo) {
    return res.status(500).json({
      error: 'NGPay did not return an order number',
      gatewayResponse: result.body,
    });
  }

  // Extract UPI ID and amount.
  // 1) First check payContent (NGPay QR content, may contain UPI deeplink).
  // 2) Then call order detail API to get iframeUrl, then global iframe extractor.
  // 3) Then try extracting from payUrl.
  let upiId = null;
  let deeplinkAmount = null;
  let upiExtractionSuccess = false;

  if (payContent && typeof payContent === 'string') {
    const contentTrimmed = payContent.trim();
    if (/^upi:\/\//i.test(contentTrimmed)) {
      const parsed = parseUpiDeeplink(contentTrimmed);
      if (parsed?.upiId) {
        upiId = parsed.upiId;
        upiExtractionSuccess = true;
      }
      if (parsed?.amount) {
        deeplinkAmount = parsed.amount;
        upiExtractionSuccess = true;
      }
    }
  }

  // Call NGPay order detail API to get iframeUrl with UPI parameter.
  if ((!upiId || !deeplinkAmount) && orderNo) {
    try {
      const detail = await getNgpayOrderDetail(orderNo);
      if (detail.ok && detail.body?.code === 200 && detail.body?.data) {
        const detailData = detail.body.data;
        const iframeUrl = detailData.iframeUrl || '';
        const detailAmount = detailData.amount;

        // Use global iframe extractor on iframeUrl
        if (iframeUrl) {
          const extracted = await extractUpiFromIframe(iframeUrl, detailAmount || normalized.toFixed(2));
          if (extracted.upiId && !upiId) {
            upiId = extracted.upiId;
            upiExtractionSuccess = true;
          }
          if (extracted.amount && !deeplinkAmount) {
            deeplinkAmount = extracted.amount;
            upiExtractionSuccess = true;
          }
        }

        // Use amount from detail API if available
        if (detailAmount && !deeplinkAmount) {
          deeplinkAmount = String(detailAmount);
          upiExtractionSuccess = true;
        }
      }
    } catch (err) {
      log.warn({ event: 'ngpay.order.detail_failed', orderNo, err }, 'failed to get ngpay order detail');
    }
  }

  if ((!upiId || !deeplinkAmount) && payUrl) {
    const extracted = await extractUpiFromPayUrl(payUrl, { orderAmount: normalized.toFixed(2) });
    if (extracted.ok) {
      if (!upiId && extracted.upiId) {
        upiId = extracted.upiId;
        upiExtractionSuccess = true;
      }
      if (!deeplinkAmount && extracted.amount) {
        deeplinkAmount = extracted.amount;
        upiExtractionSuccess = true;
      }
    }
  }

  // Persist locally so the NGPay notify callback can find and update this order.
  try {
    let merchant = await Merchant.findOne({ merNo: NGPAY.merchantNo });
    if (!merchant && NGPAY.merchantNo && NGPAY.apiKey) {
      merchant = await Merchant.create({
        merNo: NGPAY.merchantNo,
        name: 'NGPay Merchant',
        secretKey: NGPAY.apiKey,
        status: 'active',
      });
    }

    if (merchant) {
      const groupId = body.groupId ? Number(body.groupId) : null;
      const uid = body.uid ? String(body.uid) : null;

      await Payin.create({
        payOrderNo: orderNo,
        merchant: merchant._id,
        merNo: NGPAY.merchantNo,
        outTradeNo: merchantOrderNo,
        gateway: 'ngpay',
        currencyCode: body.coinUnit || NGPAY.coinUnit,
        payType: body.payType || ngpayGateway.payType || NGPAY.payType,
        randomNo: merchantOrderNo,
        totalAmount: normalized.toFixed(2),
        notifyUrl: body.notifyUrl || NGPAY.notifyUrl || `${env.payUrlBase}/ngpay/notify`,
        payViewUrl: body.viewUrl || NGPAY.viewUrl || undefined,
        payCardNo: 'N/A',
        payBankCode: 'N/A',
        payName: body.productTitle || NGPAY.productTitle,
        payEmail: 'test@test.com',
        payPhone: '+917123456789',
        payIp: clientIp,
        payURL: payUrl,
        status: 'pending',
        upiId: upiId || undefined,
        deeplinkAmount: deeplinkAmount || undefined,
        group: groupId ? (await Group.findOne({ groupId }))?._id : undefined,
        groupId: groupId ?? undefined,
        uid: uid ?? undefined,
        rawRequest: result.request,
        rawResponse: result.body,
      });
      log.info(
        {
          event: 'ngpay.order.persisted',
          payOrderNo: orderNo,
          merchantOrderNo,
          amount: body.amount,
          upiId: upiId || null,
          deeplinkAmount: deeplinkAmount || null,
        },
        'ngpay order persisted',
      );
    }
  } catch (err) {
    log.error(
      { event: 'ngpay.order.persist_failed', merchantOrderNo, orderNo, err },
      'failed to persist ngpay order',
    );
  }

  // Normalize response for the bot/frontend (same shape as RRPay /payin/order)
  const displayAmount = deeplinkAmount || normalized.toFixed(2);

  return res.status(200).json({
    ok: true,
    gateway: 'ngpay',
    amount: normalized.toFixed(2),
    merchantOrderNo,
    data: result.body, // raw NGPay response { code, msg, data: {...} }
    // Normalized fields for bot/frontend compatibility
    resultCode: '0000',
    stateInfo: ngpayData.msg || 'success',
    payOrderNo: orderNo,
    totalAmount: displayAmount,
    currencyCode: body.coinUnit || NGPAY.coinUnit,
    payType: body.payType || ngpayGateway.payType || NGPAY.payType,
    payURL: payUrl,
    payUrl: payUrl,
    upiId: upiId || null,
    deeplinkAmount: deeplinkAmount || null,
    upiExtractionSuccess,
    // Tell bot whether to send to group or owner-only
    showToGroup: Boolean(upiExtractionSuccess),
  });
});
