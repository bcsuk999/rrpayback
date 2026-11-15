import crypto from 'node:crypto';

/**
 * Signature rule from apidocs/rrpayapidoc.md (Appendix - Signature Specifications):
 *  1. drop `sign` (and any caller-specified fields) and empty values
 *  2. sort parameter names by ASCII ascending
 *  3. build a compact JSON string of the sorted params
 *  4. append the merchant key directly (no separator)
 *  5. MD5 and uppercase
 *
 * Note: RRPay's live gateway does NOT include the `pay` (payer IP) field in the
 * signature even though the doc lists it. Callers that talk to RRPay directly
 * should pass excludedFields containing 'pay' (see payinOrderController).
 */
export function buildSignString(params, secret, excludedFields = ['sign']) {
  const excluded = new Set(excludedFields);
  const sorted = {};
  Object.keys(params)
    .filter((key) => !excluded.has(key))
    .filter((key) => {
      const value = params[key];
      return value !== undefined && value !== null && String(value) !== '';
    })
    .sort()
    .forEach((key) => {
      sorted[key] = String(params[key]);
    });

  return JSON.stringify(sorted) + secret;
}

export function createSign(params, secret, excludedFields = ['sign']) {
  return crypto
    .createHash('md5')
    .update(buildSignString(params, secret, excludedFields), 'utf8')
    .digest('hex')
    .toUpperCase();
}

export function verifySign(params, secret) {
  const provided = String(params?.sign ?? '').toUpperCase();
  if (!provided) return false;

  // Accept signatures computed with or without the `pay` field, since the doc
  // and the live gateway disagree on whether `pay` participates.
  const expectedWithPay = createSign(params, secret, ['sign']);
  const expectedWithoutPay = createSign(params, secret, ['sign', 'pay']);

  const candidates = [expectedWithPay, expectedWithoutPay];
  return candidates.some((expected) => {
    if (provided.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}
