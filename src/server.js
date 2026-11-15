import './config/dns.js';
import app from './app.js';
import { env } from './config/env.js';
import connectDB from './config/db.js';
import { startBot, stopBot } from './bot/client.js';

// Connect first: db.js exits the process if the initial connection fails.
await connectDB();

const server = app.listen(env.port, () => {
  console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  startBot().catch((err) => console.error('[bot] start failed:', err?.message));
});

function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  stopBot().finally(() => server.close(() => process.exit(0)));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
