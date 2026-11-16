import crypto from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'upi.extractor' });

const SIGN_SALT = '5f3b2d9a7c1e4f8b0d6a7e9f3c2b1a0d';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function parseUpiDeeplink(deeplink) {
  if (!deeplink || typeof deeplink !== 'string') return null;
  const text = deeplink.trim();
  if (!/^upi:\/\//i.test(text)) return null;
  try {
    const u = new URL(text);
    const pa = (u.searchParams.get('pa') || '').trim();
    const am = (u.searchParams.get('am') || '').trim();
    const pn = (u.searchParams.get('pn') || '').trim();
    return {
      deeplink: text,
      upiId: pa || null,
      amount: am || null,
      payeeName: pn || null,
    };
  } catch {
    // fallback regex parse
    const pa = text.match(/[?&]pa=([^&\s]+)/i)?.[1];
    const am = text.match(/[?&]am=([^&\s]+)/i)?.[1];
    const decode = (v) => {
      if (!v) return null;
      try { return decodeURIComponent(v).trim(); } catch { return v.trim(); }
    };
    return {
      deeplink: text,
      upiId: decode(pa),
      amount: decode(am),
      payeeName: decode(text.match(/[?&]pn=([^&\s]+)/i)?.[1]),
    };
  }
}

function getPayParams(url) {
  const u = new URL(url);
  return {
    orderId: u.searchParams.get('order_id') || '',
    nonce: u.searchParams.get('nonce') || '',
    orderNo: u.searchParams.get('orderNo') || u.searchParams.get('orderno') || '',
  };
}

async function extractFromQuickPay(payUrl) {
  const { orderId, nonce } = getPayParams(payUrl);
  if (!orderId || !nonce) throw new Error('missing_order_id_or_nonce');

  const sign = crypto
    .createHash('md5')
    .update(`${orderId}${nonce}${SIGN_SALT}`)
    .digest('hex')
    .toUpperCase();

  const base = new URL(payUrl).origin;
  const endpoint = `${base}/api/v1/payin/payment`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ orderId, nonce: Number(nonce), sign }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.code !== 0) {
    throw new Error(json.msg || `payment_api_error_${json.code}`);
  }
  const qrPayUrl = json?.data?.qrPayUrl;
  if (!qrPayUrl) throw new Error('missing_qr_pay_url');

  const deeplink = await decodeQrImage(qrPayUrl);
  const parsed = parseUpiDeeplink(deeplink);
  if (!parsed?.upiId) throw new Error('upi_id_missing_in_deeplink');
  if (!parsed?.amount) throw new Error('amount_missing_in_deeplink');
  return parsed;
}

async function extractFromWalletPay(payUrl) {
  const u = new URL(payUrl);
  const orderNo = u.searchParams.get('orderNo') || u.searchParams.get('orderno') || '';
  if (!orderNo) throw new Error('missing_order_no');

  const endpoint = `${u.origin}/prod-api/api/wallet/getOrder`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'accept': 'application/json',
      'user-agent': USER_AGENT,
      'origin': u.origin,
      'referer': payUrl,
    },
    body: JSON.stringify({ orderNo }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.code !== 200 && json.code !== 0) {
    throw new Error(json.message || json.msg || `wallet_api_error_${json.code}`);
  }
  const data = json.data || {};

  let upiId = (data.upi || data.upiId || data.upi_id || '').trim() || null;
  let amount = data.payAmount ?? data.amount ?? null;
  if (amount != null) amount = String(amount).trim();
  if (amount === '' || amount === 'null' || amount === 'undefined') amount = null;

  // payUrl may contain a UPI intent with pa/am
  const intent = data.payUrl || data.upiLink || data.payUpiLink || null;
  if (intent && typeof intent === 'string' && /^upi:\/\//i.test(intent.trim())) {
    const parsed = parseUpiDeeplink(intent.trim());
    if (!upiId && parsed?.upiId) upiId = parsed.upiId;
    if (!amount && parsed?.amount) amount = parsed.amount;
  }

  if (!upiId) throw new Error('upi_id_missing_in_response');
  if (!amount) throw new Error('amount_missing_in_response');

  const deeplink = intent && /^upi:\/\//i.test(String(intent).trim())
    ? String(intent).trim()
    : `upi://pay?pa=${encodeURIComponent(upiId)}&am=${encodeURIComponent(amount)}&cu=INR`;

  return {
    deeplink,
    upiId,
    amount,
    payeeName: data.payeeName || data.name || null,
  };
}

async function decodeQrImage(imageUrl) {
  let buffer;
  if (/^data:/i.test(imageUrl)) {
    const base64 = imageUrl.slice(imageUrl.indexOf(',') + 1);
    buffer = Buffer.from(base64, 'base64');
  } else {
    const res = await fetch(imageUrl, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
    if (!res.ok) throw new Error(`qr_image_fetch_failed_${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  }
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  if (!code?.data) throw new Error('qr_decode_failed');
  return code.data;
}

export async function extractUpiFromPayUrl(payUrl, { timeoutMs = 15000 } = {}) {
  const started = Date.now();
  const host = (() => { try { return new URL(payUrl).host; } catch { return null; } })();
  try {
    if (!payUrl || typeof payUrl !== 'string') throw new Error('missing_pay_url');
    const u = new URL(payUrl);
    const params = u.searchParams;

    let parsed;
    if (params.get('order_id') && params.get('nonce')) {
      parsed = await extractFromQuickPay(payUrl);
    } else if (params.get('orderNo') || params.get('orderno') || /\/payment/i.test(u.pathname)) {
      parsed = await extractFromWalletPay(payUrl);
    } else {
      // Try quickPay first, then wallet as fallback
      try {
        parsed = await extractFromQuickPay(payUrl);
      } catch (e1) {
        try {
          parsed = await extractFromWalletPay(payUrl);
        } catch (e2) {
          throw e1; // report primary error
        }
      }
    }

    log.info({
      event: 'upi.extract.success',
      payUrlHost: host,
      upiId: parsed.upiId,
      amount: parsed.amount,
      durationMs: Date.now() - started,
    }, 'extracted upi from deeplink');
    return { ok: true, ...parsed };
  } catch (err) {
    log.warn({
      event: 'upi.extract.failed',
      payUrlHost: host,
      error: err?.message,
      durationMs: Date.now() - started,
    }, 'failed to extract upi from deeplink');
    return { ok: false, error: err?.message || 'extract_failed' };
  }
}