/**
 * Currency and payment-type codes from apidocs/rrpayapidoc.md (Appendix).
 * Keep in sync with the doc when it changes.
 */
export const CURRENCIES = {
  INR: ['INRO', 'INRT', 'SCAN'],
  INRTWO: ['SCANTWO'],
  MXN: ['MXN01'],
  PKR: [
    'Jazzcash',
    'Easypaisa',
    'Jazzcash_Direct',
    'Easypaisa_Direct',
    'Easypaisa_QR',
    'Jazzcash_QR',
    'Jazzcash_ZZ',
  ],
  VND: ['BANKSCAN'],
  IDR: ['QR', 'DANA', 'VA'],
  BDT: ['NAGAD', 'BKASH', 'ROCKET', 'BANK'],
  PHP: ['GCASH'],
  BRL: ['PIX'],
};

/** Returns the canonical currency code (uppercase) or null when unsupported. */
export function canonicalCurrency(code) {
  const value = String(code ?? '').trim().toUpperCase();
  return Object.keys(CURRENCIES).find((currency) => currency === value) ?? null;
}

/** Returns the doc's canonical payment type for that currency, or null when unsupported. */
export function canonicalPayType(currency, payType) {
  const types = CURRENCIES[currency];
  if (!types) return null;

  const value = String(payType ?? '').trim().toUpperCase();
  return types.find((type) => type.toUpperCase() === value) ?? null;
}
