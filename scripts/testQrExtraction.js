import dotenv from 'dotenv';
dotenv.config({ override: true, quiet: true });
import crypto from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';

/**
 * Test helper: run the full QR extraction flow against a hosted RRPay QuickPay link.
 *
 * Flow:
 *   1. Take a Pay URL like:
 *      https://hub.swaypp.net/quickPay?nonce=89634&order_id=P21221345859354050567298&...
 *   2. Extract order_id + nonce from the query string.
 *   3. Call POST {payHost}/api/v1/payin/payment to get data.qrPayUrl.
 *   4. Download the QR image and decode it into a string with jsQR.
 *
 * Usage:
 *   node scripts/testQrExtraction.js
 *   node scripts/testQrExtraction.js "https://hub.swaypp.net/quickPay?nonce=89634&order_id=..."
 *   PAY_URL="https://..." node scripts/testQrExtraction.js
 */

const DEFAULT_PAY_URL =
  'https://hub.swaypp.net/quickPay?nonce=89634&order_id=P21221345859354050567298&platform=SwayPay&timestamp=1794791287298&upi=8092808983%40ptaxis';

const SIGN_SALT = '5f3b2d9a7c1e4f8b0d6a7e9f3c2b1a0d';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getPayParams(url) {
  const u = new URL(url);
  return {
    orderId: u.searchParams.get('order_id') ?? '',
    nonce: u.searchParams.get('nonce') ?? '',
  };
}

async function getQrPayUrl(url, orderId, nonce) {
  const sign = crypto
    .createHash('md5')
    .update(`${orderId}${nonce}${SIGN_SALT}`)
    .digest('hex')
    .toUpperCase();

  const base = new URL(url).origin; // e.g. https://hub.rhinosy.top — derived from the Pay URL under test
  const res = await fetch(`${base}/api/v1/payin/payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ orderId, nonce: Number(nonce), sign }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.msg ?? 'Payment API error');
  return json.data.qrPayUrl;
}

async function decodeQrImage(imageUrl) {
  let buffer;
  if (/^data:/i.test(imageUrl)) {
    const base64 = imageUrl.slice(imageUrl.indexOf(',') + 1);
    buffer = Buffer.from(base64, 'base64');
  } else {
    const res = await fetch(imageUrl, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
    if (!res.ok) throw new Error(`Failed to fetch QR image: ${res.status} ${res.statusText}`);
    buffer = Buffer.from(await res.arrayBuffer());
  }
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  // jsQR expects RGBA; sharp may return RGB, so expand to 4 channels.
  let rgba = data;
  if (info.channels < 4) {
    const src = data;
    const dst = Buffer.alloc(info.width * info.height * 4);
    for (let i = 0, j = 0; i < src.length; i += info.channels, j += 4) {
      dst[j] = src[i];
      dst[j + 1] = src[i + 1];
      dst[j + 2] = src[i + 2];
      dst[j + 3] = 255;
    }
    rgba = dst;
  }
  return jsQR(rgba, info.width, info.height);
}

async function main() {
  const url = process.argv[2] || process.env.PAY_URL || DEFAULT_PAY_URL;
  const { orderId, nonce } = getPayParams(url);

  console.log(`[qr-test] pay url: ${url}`);
  console.log(`[qr-test] orderId=${orderId} nonce=${nonce}`);

  const qrPayUrl = await getQrPayUrl(url, orderId, nonce);
  console.log(`[qr-test] qrPayUrl: ${qrPayUrl}`);

  const code = await decodeQrImage(qrPayUrl);
  if (code?.data) {
    console.log('[qr-test] QR decoded OK');
    console.log('[qr-test] qrString:', code.data);
    console.log('[qr-test] type:', code.type);
  } else {
    console.log('[qr-test] No QR code found in image.');
  }
}

main().catch((err) => {
  console.error('[qr-test] error:', err?.message ?? err);
  process.exit(1);
});
