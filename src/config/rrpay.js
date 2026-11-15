/**
 * Fixed RRPay gateway settings used by POST /payin/order.
 * These are deployment constants, not environment configuration.
 */
export const RRPAY = {
  /** Gateway host that receives our signed /payin/create requests. */
  baseUrl: 'https://api.rrpay.ai',
  /** Abort an upstream call after this many milliseconds. */
  timeoutMs: 20000,
  /** Callback URL sent to RRPay for payment notifications. */
  notifyUrl: 'http://localhost:4000/payin/notify',
  /** Defaults applied when the caller only sends an amount. */
  currencyCode: 'INR',
  payType: 'INRT',
  payIp: '103.21.244.5',
};
