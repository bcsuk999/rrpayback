import crypto from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'upi.extractor' });

const SIGN_SALT = '5f3b2d9a7c1e4f8b0d6a7e9f3c2b1a0d';
const EPET_HY_KEY = 'pinternal2022jfhuif';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function hySign(obj) {
  const t = { ...(obj || {}) };
  const keys = Object.keys(t).sort();
  let s = '';
  for (const k of keys) {
    const v = t[k];
    if (v !== undefined && v !== null && v !== '') s += `${k}=${v}&`;
  }
  s += `key=${EPET_HY_KEY}`;
  t.sign = crypto.createHash('md5').update(s).digest('hex').toUpperCase();
  return t;
}

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
  const responseText = await res.text();
  let json;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(`wallet_api_invalid_json_http_${res.status}`);
  }
  if (!res.ok) throw new Error(`wallet_api_http_${res.status}`);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('wallet_api_invalid_response');
  }

  const envelope = json.data && typeof json.data === 'object' && !Array.isArray(json.data)
    ? json.data
    : json;
  const responseCode = json.code ?? envelope.code;
  if (responseCode !== undefined && ![200, 0, '200', '0'].includes(responseCode)) {
    throw new Error(
      json.message ||
      json.msg ||
      envelope.message ||
      envelope.msg ||
      `wallet_api_error_${responseCode}`,
    );
  }
  const data = envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
    ? envelope.data
    : envelope;

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

async function extractFromEpetPay(payUrl) {
  const u = new URL(payUrl);
  const payOrderNo = u.searchParams.get('payOrderNo') || '';
  const sign = u.searchParams.get('sign') || '';
  if (!payOrderNo) throw new Error('missing_pay_order_no');

  const base = u.origin;
  const headers = {
    'content-type': 'application/json',
    'accept': 'application/json, text/plain, */*',
    'user-agent': USER_AGENT,
    'origin': base,
    'referer': payUrl,
  };

  // 1) Order detail (amount, status, qrcodeContent)
  const detailRes = await fetch(`${base}/repay-api/apiMixDsOrderDetail`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ payOrderNo, sign }),
  });
  const detail = await detailRes.json().catch(() => ({}));
  if (detail.code !== 0 && detail.code !== 200) {
    throw new Error(detail.message || detail.msg || `epet_detail_error_${detail.code ?? detailRes.status}`);
  }

  let amount = detail.amount ?? detail.payAmount ?? null;
  if (amount != null) amount = String(amount).trim();
  if (amount === '' || amount === 'null' || amount === 'undefined') amount = null;

  let upiId = null;
  let deeplink = null;
  const qrcodeContent = detail.qrcodeContent || detail.qrcodeIntentUrl || null;
  if (qrcodeContent && typeof qrcodeContent === 'string' && /^upi:\/\//i.test(qrcodeContent.trim())) {
    const parsed = parseUpiDeeplink(qrcodeContent.trim());
    if (parsed?.upiId) upiId = parsed.upiId;
    if (!amount && parsed?.amount) amount = parsed.amount;
    deeplink = qrcodeContent.trim();
  }

  // 2) Try available UPI/intents (may fail for expired orders)
  if (!upiId) {
    try {
      const upiRes = await fetch(`${base}/repay-api/apiMixDsGetAvailableUpiAll`, {
        method: 'POST',
        headers,
        body: JSON.stringify(hySign({ payOrderNo })),
      });
      const upiJson = await upiRes.json().catch(() => ({}));
      if (upiJson && (upiJson.code === 0 || upiJson.success === true)) {
        const intent = upiJson.qrcodeIntentUrl || upiJson.intentUrl || null;
        const copyVpa = upiJson.copyVpa || upiJson.vpa || upiJson.upi || null;
        if (intent && typeof intent === 'string' && /^upi:\/\//i.test(intent.trim())) {
          const parsed = parseUpiDeeplink(intent.trim());
          if (!upiId && parsed?.upiId) upiId = parsed.upiId;
          if (!amount && parsed?.amount) amount = parsed.amount;
          if (!deeplink) deeplink = intent.trim();
        }
        if (!upiId && copyVpa && typeof copyVpa === 'string' && copyVpa.includes('@')) {
          upiId = copyVpa.trim();
        }
      }
    } catch (_) {
      // best-effort; detail response may still be sufficient
    }
  }

  if (!upiId) throw new Error('upi_id_missing_in_response');
  if (!amount) throw new Error('amount_missing_in_response');

  if (!deeplink) {
    deeplink = `upi://pay?pa=${encodeURIComponent(upiId)}&am=${encodeURIComponent(amount)}&cu=INR`;
  }

  return {
    deeplink,
    upiId,
    amount,
    payeeName: detail.payeeName || detail.name || null,
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

function extractUpiFromHtml(html) {
  if (!html || typeof html !== 'string') return { upiId: null, amount: null };

  // 1) Look for UPI deeplink: upi://pay?pa=merchant@bank&am=100&...
  const upiMatch = html.match(/upi:\/\/(?:pay\?)?[^&"\s<>'`]+/i);
  if (upiMatch) {
    try {
      const deeplink = upiMatch[0].replace(/['">]<.*$/, '');
      const parsed = parseUpiDeeplink(deeplink);
      if (parsed?.upiId) return { upiId: parsed.upiId, amount: parsed.amount || null };
    } catch {}
  }

  // 2) Look for VPA pattern: merchant@bank
  const vpaMatch = html.match(/\b[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}\b/);
  if (vpaMatch) {
    return { upiId: vpaMatch[0], amount: null };
  }

  // 3) Look for amount patterns: ₹500.00 or Rs. 500 or 500.00
  const amtMatch = html.match(/[₹Rs\.]\s*([\d,]+\.?\d*)/i);
  let amount = null;
  if (amtMatch) {
    amount = amtMatch[1].replace(/,/g, '');
  }

  return { upiId: null, amount };
}

async function extractFromNgpay(payUrl, orderAmount) {
  const u = new URL(payUrl);
  const res = await fetch(payUrl, {
    method: 'GET',
    headers: {
      'user-agent': USER_AGENT,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-IN,en;q=0.9',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`ngpay_fetch_failed_${res.status}`);

  const html = await res.text();

  // Extract from HTML
  const extracted = extractUpiFromHtml(html);
  if (extracted.upiId) {
    const deeplink = `upi://pay?pa=${encodeURIComponent(extracted.upiId)}&am=${encodeURIComponent(orderAmount)}&cu=INR`;
    return {
      deeplink,
      upiId: extracted.upiId,
      amount: extracted.amount || String(orderAmount),
      payeeName: null,
    };
  }

  // Look for QR code images in HTML and decode them
  const qrMatches = html.match(/<img[^>]+src=["']([^"']+)["']/gi);
  if (qrMatches) {
    for (const imgTag of qrMatches) {
      const srcMatch = imgTag.match(/src=["']([^"']+)["']/);
      if (!srcMatch) continue;
      let qrUrl = srcMatch[1];
      try {
        if (qrUrl.startsWith('/')) qrUrl = `${u.origin}${qrUrl}`;
        else if (!qrUrl.startsWith('http')) qrUrl = new URL(qrUrl, payUrl).href;

        const qrData = await decodeQrImage(qrUrl);
        if (/^upi:\/\//i.test(qrData.trim())) {
          const parsed = parseUpiDeeplink(qrData.trim());
          if (parsed?.upiId) {
            const deeplink = `upi://pay?pa=${encodeURIComponent(parsed.upiId)}&am=${encodeURIComponent(orderAmount)}&cu=INR`;
            return {
              deeplink,
              upiId: parsed.upiId,
              amount: parsed.amount || String(orderAmount),
              payeeName: parsed.payeeName || null,
            };
          }
        } else if (qrData.includes('@')) {
          // Raw VPA in QR
          const upiId = qrData.trim().split(/\s/)[0];
          const deeplink = `upi://pay?pa=${encodeURIComponent(upiId)}&am=${encodeURIComponent(orderAmount)}&cu=INR`;
          return {
            deeplink,
            upiId,
            amount: String(orderAmount),
            payeeName: null,
          };
        }
      } catch (_) {
        // Try next QR image
        continue;
      }
    }
  }

  throw new Error('ngpay_upi_extract_failed');
}

/**
 * Global iframe UPI & amount extractor.
 * Works for any iframe URL:
 *  1. Scans iframe URL query params for UPI (upi=, pa=, vpa=, amount=, am=, etc.)
 *  2. Fetches iframe HTML and scans for VPA patterns (merchant@bank) and UPI deeplinks
 *  3. Decodes QR code images embedded in the HTML
 *  4. Falls back to gateway-specific extraction if available
 *
 * @param {string} iframeUrl - The iframe/cashier URL
 * @param {string|number} orderAmount - Fallback amount if not found on page
 * @returns {{upiId: string|null, amount: string|null, deeplink: string|null}}
 */
export async function extractUpiFromIframe(iframeUrl, orderAmount) {
  if (!iframeUrl || typeof iframeUrl !== 'string') {
    return { upiId: null, amount: String(orderAmount), deeplink: null };
  }

  try {
    const u = new URL(iframeUrl);

    // 1) Extract from iframe URL query parameters
    const params = u.searchParams;
    const upiParam =
      params.get('upi') ||
      params.get('pa') ||
      params.get('vpa') ||
      params.get('upiId') ||
      null;

    const amountParam =
      params.get('amount') ||
      params.get('am') ||
      params.get('amt') ||
      params.get('orderAmount') ||
      null;

    if (upiParam && upiParam.includes('@')) {
      return {
        upiId: decodeURIComponent(upiParam),
        amount: amountParam ? String(amountParam) : String(orderAmount),
        deeplink: `upi://pay?pa=${encodeURIComponent(decodeURIComponent(upiParam))}&am=${encodeURIComponent(amountParam || orderAmount)}&cu=INR`,
      };
    }

    // 2) Fetch iframe HTML and scan for VPA/UPI patterns
    const res = await fetch(iframeUrl, {
      method: 'GET',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-IN,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (res.ok) {
      const html = await res.text();

      // Scan for UPI deeplink in HTML
      const upiMatch = html.match(/upi:\/\/(?:pay\?)?[^&"\s<>'`]+/i);
      if (upiMatch) {
        try {
          const deeplink = upiMatch[0].replace(/['">]<.*$/, '');
          const parsed = parseUpiDeeplink(deeplink);
          if (parsed?.upiId) {
            return {
              upiId: parsed.upiId,
              amount: parsed.amount || String(orderAmount),
              deeplink,
            };
          }
        } catch {}
      }

      // Scan for VPA pattern in HTML
      const vpaMatch = html.match(/\b[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}\b/);
      if (vpaMatch) {
        return {
          upiId: vpaMatch[0],
          amount: String(orderAmount),
          deeplink: `upi://pay?pa=${encodeURIComponent(vpaMatch[0])}&am=${encodeURIComponent(orderAmount)}&cu=INR`,
        };
      }

      // 3) Decode QR code images embedded in HTML
      const qrMatches = html.match(/<img[^>]+src=["']([^"']+)["']/gi);
      if (qrMatches) {
        for (const imgTag of qrMatches) {
          const srcMatch = imgTag.match(/src=["']([^"']+)["']/);
          if (!srcMatch) continue;
          let qrUrl = srcMatch[1];
          try {
            if (qrUrl.startsWith('/')) qrUrl = `${u.origin}${qrUrl}`;
            else if (!qrUrl.startsWith('http')) qrUrl = new URL(qrUrl, iframeUrl).href;

            const qrData = await decodeQrImage(qrUrl);
            const trimmed = qrData.trim();
            if (/^upi:\/\//i.test(trimmed)) {
              const parsed = parseUpiDeeplink(trimmed);
              if (parsed?.upiId) {
                return {
                  upiId: parsed.upiId,
                  amount: parsed.amount || String(orderAmount),
                  deeplink: trimmed,
                };
              }
            } else if (trimmed.includes('@')) {
              const upiId = trimmed.split(/\s/)[0];
              return {
                upiId,
                amount: String(orderAmount),
                deeplink: `upi://pay?pa=${encodeURIComponent(upiId)}&am=${encodeURIComponent(orderAmount)}&cu=INR`,
              };
            }
          } catch (_) {
            continue;
          }
        }
      }
    }
  } catch (_) {
    // Fetch failed or parsing failed - return null
  }

  return { upiId: null, amount: String(orderAmount), deeplink: null };
}

export async function extractUpiFromPayUrl(payUrl, { timeoutMs = 15000, orderAmount } = {}) {
  const started = Date.now();
  const host = (() => { try { return new URL(payUrl).host; } catch { return null; } })();
  try {
    if (!payUrl || typeof payUrl !== 'string') throw new Error('missing_pay_url');
    const u = new URL(payUrl);
    const params = u.searchParams;

    let parsed;
    if (params.get('order_id') && params.get('nonce')) {
      parsed = await extractFromQuickPay(payUrl);
    } else if (params.get('payOrderNo') && (params.get('sign') || /epethub|l1mix|onepage/i.test(u.host + u.pathname))) {
      parsed = await extractFromEpetPay(payUrl);
    } else if (/ngpayvip/i.test(u.host) || /\/pay\/cashier/i.test(u.pathname)) {
      parsed = await extractFromNgpay(payUrl, orderAmount);
    } else if (params.get('orderNo') || params.get('orderno') || /\/payment/i.test(u.pathname)) {
      parsed = await extractFromWalletPay(payUrl);
    } else {
      // Try quickPay first, then epet/wallet as fallbacks
      const attempts = [() => extractFromQuickPay(payUrl)];
      if (params.get('payOrderNo')) attempts.push(() => extractFromEpetPay(payUrl));
      attempts.push(() => extractFromWalletPay(payUrl));
      let firstErr;
      for (const attempt of attempts) {
        try {
          parsed = await attempt();
          firstErr = null;
          break;
        } catch (e) {
          if (!firstErr) firstErr = e;
        }
      }
      if (!parsed) throw firstErr || new Error('extract_failed');
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