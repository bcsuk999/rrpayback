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

    // Structured update logging for production tracing
    bot.use(async (ctx, next) => {
      const meta = {
        ts: new Date().toISOString(),
        level: 'info',
        event: 'bot.update',
        updateId: ctx?.update?.update_id,
        chatId: ctx?.chat?.id,
        chatType: ctx?.chat?.type,
        fromId: ctx?.from?.id,
        text: ctx?.message?.text,
      };
      console.log(JSON.stringify(meta));
      return next();
    });

    register(bot, config);

    if (typeof bot.catch === 'function') {
      bot.catch((err, ctx) => {
        console.error(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          event: 'bot.unhandled_update_error',
          updateId: ctx?.update?.update_id,
          chatId: ctx?.chat?.id,
          fromId: ctx?.from?.id,
          text: ctx?.message?.text,
          error: err?.message,
          stack: err?.stack,
        }));
      });
    }

    bot.startPolling().catch((err) => console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'bot.polling_error',
      error: err?.message,
      stack: err?.stack,
    })));
    const me = await bot.api.getMe();
    running = true;
    lastError = null;
    console.log(`[bot] connected as @${me.username} (owner ${config.ownerId})`);

    const groupMenu = [
      { command: 'balance', description: 'Show group balance' },
      { command: 'id', description: 'Show group ID, UID and created date' },
      { command: 'd', description: 'Create a payin order: /d <amount>' },
      { command: 'help', description: 'Show available commands' },
      { command: 'status', description: 'Check an order: /status <payOrderNo>' },
    ];
    const ownerMenu = [
      ...groupMenu,
      { command: 'reg', description: 'Register this group (owner only)' },
      { command: 'gmsg', description: 'Send a message (owner only)' },
      { command: 'md', description: 'Toggle maintenance (owner only)' },
    ];

    try {
      await bot.api.setMyCommands({ commands: groupMenu, scope: { type: 'all_group_chats' } });
      console.log('[bot] group command menu set');
    } catch (err) {
      console.warn('[bot] setMyCommands (group) failed:', err?.message);
    }

    try {
      await bot.api.setMyCommands({ commands: ownerMenu, scope: { type: 'chat', chat_id: config.ownerId } });
      console.log('[bot] owner command menu set');
    } catch (err) {
      console.warn('[bot] setMyCommands (owner) failed:', err?.message);
    }

    // Default scope (private chats that aren't the owner) — keep minimal.
    try {
      await bot.api.setMyCommands({ commands: [
        { command: 'start', description: 'Show bot info and command list' },
        { command: 'help', description: 'Show available commands' },
      ] });
    } catch (err) {
      console.warn('[bot] setMyCommands (default) failed:', err?.message);
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
