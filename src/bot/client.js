import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Bot } = require('node-telegram-bot-api');

import { loadConfig, validateConfig } from './config.js';
import { register } from './commands.js';

let bot = null;
let config = null;
let running = false;
let lastError = null;

export function getClient() {
  return bot;
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
    bot = new Bot(config.token);
    register(bot, config);

    bot.startPolling().catch((err) => console.error('[bot] polling loop error:', err?.message));
    const me = await bot.api.getMe();
    running = true;
    lastError = null;
    console.log(`[bot] connected as @${me.username} (owner ${config.ownerId})`);

    try {
      await bot.api.setMyCommands([
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
      await bot?.stop();
    } catch (_) {
      // already stopped
    }
    bot = null;
    console.error('[bot] failed to start:', lastError);
    return { started: false, reason: 'start_failed', error: lastError };
  }
}

export async function stopBot() {
  if (!bot) return { stopped: false };
  try {
    await bot.stop();
  } catch (err) {
    console.warn('[bot] error during shutdown:', err?.message);
  }
  running = false;
  bot = null;
  console.log('[bot] stopped');
  return { stopped: true };
}

export function processWebhookUpdate(update) {
  if (!bot) return false;
  try {
    bot.handleUpdate(update);
    return true;
  } catch (err) {
    console.error('[bot] failed to process update:', err?.message);
    return false;
  }
}
