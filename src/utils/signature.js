import crypto from 'node:crypto';

/**
 * Signature rule from apidocs/rrpayapidoc.md (Appendix - Signature Specifications):
 *  1. drop `sign` and empty values
 *  2. sort parameter names by ASCII ascending
 *  3. build a compact JSON string of the sorted params
 *  4. append the merchant key directly (no separator)
 *  5. MD5 and uppercase
 *
 * All non-empty fields (including payIp) participate in the signature per the doc.
 */
export function buildSignString(params, secret) {
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

  return JSON.stringify(sorted) + secret;
}

export function createSign(params, secret) {
  return crypto
    .createHash('md5')
    .update(buildSignString(params, secret), 'utf8')
    .digest('hex')
    .toUpperCase();
}

export function verifySign(params, secret) {
  const provided = String(params?.sign ?? '').toUpperCase();
  if (!provided) return false;

  const expected = createSign(params, secret);
  if (provided.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
