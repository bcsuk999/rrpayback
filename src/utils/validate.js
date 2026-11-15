import net from 'node:net';

// Max lengths from apidocs/rrpayapidoc.md (String(n)).
export const LIMITS = {
  merNo: 15,
  currencyCode: 16,
  payType: 16,
  randomNo: 14,
  outTradeNo: 20,
  totalAmount: 9,
  notifyUrl: 128,
  sign: 32,
  payCardNo: 32,
  payBankCode: 32,
  payName: 32,
  payEmail: 32,
  payPhone: 32,
  pay: 32,
  payViewUrl: 128,
  payParams: 2000,
};

export function firstMissing(body, fields) {
  return fields.find((field) => body[field] === undefined || body[field] === null || String(body[field]).trim() === '');
}

export function firstTooLong(body, fields) {
  return fields.find((field) => body[field] != null && String(body[field]).length > LIMITS[field]);
}

/** "1" -> "1.00", "1.5" -> "1.50". Returns null when invalid. */
export function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
}

export function isValidAmount(value) {
  const raw = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return false;
  const normalized = normalizeAmount(raw);
  return normalized !== null && normalized.length <= LIMITS.totalAmount;
}

export function isValidEmail(value) {
  return value.length <= LIMITS.payEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

// India coins use the doc's +91 rule (10 digits starting 6-9);
// other currencies use a generic E.164-style check so PKR/VND/IDR/... still work.
export function isValidPhone(value, currencyCode) {
  if (currencyCode === 'INR' || currencyCode === 'INRTWO') {
    return /^\+91[6-9]\d{9}$/.test(value);
  }
  return /^\+\d{8,15}$/.test(value);
}

export function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidPayerIp(value) {
  if (!net.isIP(value)) return false;
  if (value === '0.0.0.0' || value === '::1' || value.startsWith('127.')) return false;
  return true;
}
