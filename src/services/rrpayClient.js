import { RRPAY } from '../config/rrpay.js';

/**
 * POSTs JSON to RRPay and returns everything needed to mirror or explain the result.
 * Never throws: network failures come back as { networkError: true, ... }.
 */
export async function callRrpay(path, payload) {
  const url = `${RRPAY.baseUrl.replace(/\/+$/, '')}${path}`;
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(RRPAY.timeoutMs),
    });

    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON response (HTML, plain text, empty) — keep the raw text.
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type') ?? 'text/plain',
      body,
      text,
      url,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      networkError: true,
      url,
      durationMs: Date.now() - startedAt,
      error: {
        name: error.name,
        message: error.message,
        code: error.cause?.code ?? error.code,
        cause: error.cause?.message,
        stack: error.stack,
      },
    };
  }
}
