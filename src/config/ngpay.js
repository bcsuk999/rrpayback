/**
 * NGPay gateway configuration for the test endpoint.
 * Populate these in .env before calling GET /api/test/ngpay/:amount.
 */
export const NGPAY = {
  /** NGPay gateway host (no trailing slash). */
  baseUrl: (process.env.NGPAY_BASE_URL ?? '').replace(/\/+$/, ''),
  /** Merchant secret key used to build the MD5 signature. */
  apiKey: process.env.NGPAY_API_KEY ?? '',
  /** Merchant number obtained from the NGPay merchant backend. */
  merchantNo: process.env.NGPAY_MERCHANT_NO ?? '',
  /** Product number obtained from the NGPay merchant backend. */
  productNo: process.env.NGPAY_PRODUCT_NO ?? '',
  /** Default coin unit (INR — India). */
  coinUnit: 'INR',
  /** Default pay type for INR (NGPay UPI native). */
  payType: 'UPI_INRO',
  /** Default product title. */
  productTitle: 'Test Order',
  /** Async notification URL (must be publicly reachable in production). */
  notifyUrl: process.env.NGPAY_NOTIFY_URL ?? '',
  /** Return/view URL (optional). */
  viewUrl: process.env.NGPAY_VIEW_URL ?? '',
  /** Client IP sent to NGPay. */
  clientIp: process.env.NGPAY_CLIENT_IP ?? '127.0.0.1',
  /** Upstream request timeout in ms. */
  timeoutMs: Number(process.env.NGPAY_TIMEOUT_MS ?? 30000),
};
