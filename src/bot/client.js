import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const TelegramBot = require('node-telegram-bot-api');
import { loadConfig, validateConfig } from './config.js';
import { register } from './commands.js';

let client = null;
let config = null;
let running = false;
let lastError = null;

export function getClient() {
  return client;
}

export function getConfig() {
  return config;
}

export function isRunning() {
  return running;
}

export function getLastError() {
  return lastError;
}

export async function startBot() {
  config = loadConfig();

  const problems = validateConfig(config);
  if (problems.length) {
    lastError = problems.join('; ');
    console.warn('[bot] not started:', lastError);
    return { started: false, reason: 'invalid_config', problems };
  }

  try {
    client = new TelegramBot(config.token, { polling: true });

    client.on('polling_error', (err) => {
      console.error('[bot] polling_error:', err?.message || err);
      console.error('[bot] polling error:', err?.message || err);
    });
    client.on('error', (err) => {
      console.error('[bot] client error:', err?.message || err);
    });

    register(client, config);
    console.log('[bot] handlers registered');

    const me = await client.getMe();
    running = true;
    lastError = null;
    console.log(`[bot] connected as @${me.username} (owner ${config.ownerId})`);

    try {
      await client.setMyCommands([
        { command: 'start', description: 'Show bot info and command list' },
        { command: 'help', description: 'Show available commands' },
        { command: 'order', description: 'Create a payin order: /order <amount>' },
        { command: 'status', description: 'Check an order: /status <payOrderNo>' },
      ]);
    } catch (err) {
      console.warn('[bot] setMyCommands failed:', err?.message);
    }

    return { started: true, reason: 'ok' };
  } catch (err) {
    lastError = err?.message || String(err);
    running = false;
    try {
      await client?.stopPolling();
    } catch (_) {
      // already stopped
    }
    client = null;
    console.error('[bot] failed to start:', lastError);
    return { started: false, reason: 'start_failed', error: lastError };
  }
}

export async function stopBot() {
  if (!client) return { stopped: false };
  try {
    await client.stopPolling();
  } catch (err) {
    console.warn('[bot] error during shutdown:', err?.message);
  }
  running = false;
  client = null;
  console.log('[bot] stopped');
  return { stopped: true };
}

export function processWebhookUpdate(update) {
  if (!client) return false;
  try {
    client.processUpdate(update);
    return true;
  } catch (err) {
    console.error('[bot] failed to process webhook update:', err?.message);
    return false;
  }
}
