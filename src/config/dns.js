import dns from 'node:dns';

// Force public resolvers so Atlas SRV lookups work on networks
// where the local DNS blocks or mangles SRV records.
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}
