import crypto from 'node:crypto';
import { NGPAY } from '../config/ngpay.js';

/**
 * NGPay signature rule (from apidocs/ngpayapidoc.md):
 *  1. Drop `sign` and empty values.
 *  2. Sort parameter names by ASCII ascending.
 *  3. Build key=value pairs joined by &.
 *  4. Append &key={api_key}.
 *  5. MD5, uppercase.
 */
export function buildNgpaySignContent(params, apiKey) {
  const sorted = {};
  Object.keys(params)
    .filter((key) => key !== 'sign')
    .filter((key) => {
      const value = params[key];
      return value !== undefined && value !== null && String(value) !== '';
    })
    .sort()
    .forEach((key) => {
      sorted[key] = String(params[key]);
    });

  return (
    Object.entries(sorted)
      .map(([k, v]) => `${k}=${v}`)
      .join('&') + `&key=${apiKey}`
  );
}

export function createNgpaySign(params, apiKey) {
  return crypto
    .createHash('md5')
    .update(buildNgpaySignContent(params, apiKey), 'utf8')
    .digest('hex')
    .toUpperCase();
}

export function verifyNgpaySign(params, apiKey) {
  const provided = String(params?.sign ?? '').toUpperCase();
  if (!provided) return false;

  const expected = createNgpaySign(params, apiKey);
  if (provided.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * Get NGPay order detail by order number.
 * Calls GET {baseUrl}/prod-api/open/payOrder/{orderNo}
 * Returns order data including iframeUrl which contains UPI parameters.
 */
export async function getNgpayOrderDetail(orderNo) {
  if (!NGPAY.baseUrl) {
    throw new Error('NGPay base URL not configured');
  }

  const url = `${NGPAY.baseUrl}/prod-api/open/payOrder/${orderNo}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'accept-language': 'en-US',
      },
      signal: AbortSignal.timeout(NGPAY.timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      networkError: true,
      url,
      error: {
        name: error.name,
        message: error.message,
        code: error.cause?.code ?? error.code,
        cause: error.cause?.message,
      },
    };
  }

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
    text,
    url,
  };
}

/**
 * Extract UPI ID and amount from NGPay iframeUrl.
 * The iframeUrl contains query parameter `upi` (URL-encoded VPA).
 */
export function extractUpiFromIframeUrl(iframeUrl, orderAmount) {
  if (!iframeUrl || typeof iframeUrl !== 'string') {
    return { upiId: null, amount: String(orderAmount) };
  }

  try {
    const u = new URL(iframeUrl);
    const upi = u.searchParams.get('upi');
    if (upi) {
      const decodedUpI = decodeURIComponent(upi);
      // upi parameter value is like "7815027388-1@mbkns" (VPA)
      if (decodedUpI.includes('@')) {
        return {
          upiId: decodedUpI,
          amount: String(orderAmount),
        };
      }
    }
  } catch (_) {
    // Invalid URL
  }

  return { upiId: null, amount: String(orderAmount) };
}

export async function createNgpayOrder({ amount, merchantOrderNo, clientIp, payType }) {
  if (!NGPAY.baseUrl || !NGPAY.apiKey || !NGPAY.merchantNo || !NGPAY.productNo) {
    throw new Error(
      'NGPay credentials not configured. Set NGPAY_BASE_URL, NGPAY_API_KEY, NGPAY_MERCHANT_NO and NGPAY_PRODUCT_NO in .env',
    );
  }

  const normalized = Number(amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('Invalid amount');
  }

  const timestamp = String(Date.now());
  const params = {
    merchantNo: NGPAY.merchantNo,
    merchantOrderNo,
    amount: normalized.toFixed(2),
    coinUnit: NGPAY.coinUnit,
    payType: payType || NGPAY.payType,
    productNo: NGPAY.productNo,
    productTitle: NGPAY.productTitle,
    notifyUrl: NGPAY.notifyUrl,
    viewUrl: NGPAY.viewUrl,
    clientIp: clientIp || NGPAY.clientIp,
    timestamp,
    extend: '',
  };

  params.sign = createNgpaySign(params, NGPAY.apiKey);

  const url = `${NGPAY.baseUrl}/api/pay`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(NGPAY.timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      networkError: true,
      url,
      error: {
        name: error.name,
        message: error.message,
        code: error.cause?.code ?? error.code,
        cause: error.cause?.message,
      },
      request: { ...params, sign: '[REDACTED]' },
    };
  }

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url,
    body,
    text,
    request: { ...params, sign: '[REDACTED]' },
  };
}
