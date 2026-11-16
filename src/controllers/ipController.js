import { isIP } from 'node:net';
import asyncHandler from '../utils/asyncHandler.js';

async function lookupPublicIp(url, family) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`IPv${family} lookup returned HTTP ${response.status}`);
  }

  const address = (await response.text()).trim();
  if (isIP(address) !== family) {
    throw new Error(`IPv${family} lookup returned an invalid address`);
  }
  return address;
}

export const getServerIp = asyncHandler(async (_req, res) => {
  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    lookupPublicIp('https://api4.ipify.org', 4),
    lookupPublicIp('https://api6.ipify.org', 6),
  ]);
  const errors = {};

  const ipv4 = ipv4Result.status === 'fulfilled' ? ipv4Result.value : null;
  const ipv6 = ipv6Result.status === 'fulfilled' ? ipv6Result.value : null;
  if (ipv4Result.status === 'rejected') {
    errors.ipv4 = ipv4Result.reason?.message || String(ipv4Result.reason);
  }
  if (ipv6Result.status === 'rejected') {
    errors.ipv6 = ipv6Result.reason?.message || String(ipv6Result.reason);
  }

  const success = Object.keys(errors).length === 0;
  return res.status(success ? 200 : 502).json({
    success,
    ipv4,
    ipv6,
    ...(success ? {} : { errors }),
  });
});
