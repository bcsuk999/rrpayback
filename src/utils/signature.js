import crypto from 'node:crypto';

/**
 * Builds the canonical string for signing:
 * non-empty params (except `sign`) sorted by key, joined as k=v&k=v, then &key=SECRET.
 */
export function buildSignString(params, secret) {
  const keys = Object.keys(params)
    .filter((key) => key !== 'sign')
    .filter((key) => {
      const value = params[key];
      return value !== undefined && value !== null && String(value) !== '';
    })
    .sort();

  return `${keys.map((key) => `${key}=${params[key]}`).join('&')}&key=${secret}`;
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
