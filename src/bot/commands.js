import { isOwner } from './config.js';
import { buildDepositReply, DEPOSIT_EXPIRY_MINUTES } from './deposit.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'bot' });

function ctxMeta(ctx) {
  return {
    updateId: ctx?.update?.update_id,
    chatId: ctx?.chat?.id,
    chatType: ctx?.chat?.type,
    fromId: ctx?.from?.id,
    text: ctx?.message?.text,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function fetchGroupById(chatId) {
  try {
    const port = process.env.PORT || 4000;
    const r = await fetch(`http://localhost:${port}/groups/${chatId}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

async function getRegisteredGroup(chatId) {
  try {
    const port = process.env.PORT || 4000;
    const r = await fetch(`http://localhost:${port}/groups/${chatId}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

const GROUP_LINES = [
  '/balance - Check this group balance',
  '/id      - Show this group ID and UID',
  '/d <amount> - Create a deposit',
  '/how     - How to create a deposit and use the bot',
  '/status <order id> - Check a deposit status',
  '/daily   - Deposit success rate (10m / 30m / 1h / today)',
];

const REG_LINE = '/reg     - Register a group (run it inside the group)';
const INFO_LINE = '/info <message> - Notify all active registered groups';
const PL_LINE = '/pl <t|y|w|m|DD/MM/YY> <cost> - Group profit/loss report';
const MD_LINE = '/md, /me - Toggle maintenance mode (owner only)';

// Telegram message ids of the deposit slips sent by /d, keyed by payOrderNo (for edit-in-place).
const depositMsgIds = new Map();

function rememberDepositMessage(orderNo, messageId) {
  if (orderNo && messageId) depositMsgIds.set(String(orderNo), messageId);
}

function forgetDepositMessage(orderNo) {
  if (orderNo) depositMsgIds.delete(String(orderNo));
}

function helpText({ isOwner = false } = {}) {
  const lines = ['Commands:'];
  if (isOwner) lines.push(REG_LINE, INFO_LINE, PL_LINE, MD_LINE);
  lines.push(...GROUP_LINES);
  return lines.join('\n');
}

const HELP = helpText();

async function reply(ctx, text, options) {
  const opts = options ?? { parse_mode: 'HTML' };
  try {
    return await ctx.reply(text, opts);
  } catch (err) {
    log.error({
      event: 'bot.reply_failed',
      ...ctxMeta(ctx),
      err,
      response: err?.response?.body || err?.description,
      textPreview: String(text).slice(0, 200),
    }, 'failed to send telegram reply');
    // Fallback: if HTML parsing failed, try sending as plain text to avoid silent drops
    if (opts.parse_mode === 'HTML') {
      try {
        return await ctx.reply(String(text).replace(/<[^>]+>/g, ''), {});
      } catch (err2) {
        log.error({ event: 'bot.reply_fallback_failed', ...ctxMeta(ctx), err: err2 }, 'failed to send plain-text fallback reply');
      }
    }
  }
}

async function safeHandler(name, ctx, fn) {
  try {
    return await fn();
  } catch (err) {
    log.error({ event: 'bot.handler_error', handler: name, ...ctxMeta(ctx), err }, 'bot command handler failed');
    try {
      await reply(ctx, '❌ Internal error. Please try again later.');
    } catch (_) {}
  }
}

async function handleOrder(ctx, config) {
  const chat = ctx.chat || {};
  const text = (ctx.message?.text || '').trim();
  const args = text.split(/\s+/).slice(1);
  const amount = args[0];
  if (!amount) return reply(ctx, 'Usage: /d &lt;amount&gt; (e.g. /d 100.00)');

  try {
    const port = process.env.PORT || 4000;
    const url = `http://localhost:${port}/payin/order`;
    log.info({ event: 'bot.deposit.request', ...ctxMeta(ctx), amount, url }, 'creating deposit order');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount, groupId: chat?.id, uid: ctx.groupUid }),
    });
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { _nonJson: true, raw: raw?.slice(0, 500) }; }
    log.info({
      event: 'bot.deposit.response',
      ...ctxMeta(ctx),
      httpStatus: res.status,
      ok: res.ok,
      resultCode: data?.resultCode,
      stateInfo: data?.stateInfo,
      payOrderNo: data?.payOrderNo,
      upiId: data?.upiId || null,
      hasPayURL: Boolean(data?.payURL || data?.payUrl),
      hasPayParams: Boolean(data?.payParams),
      responseKeys: data && typeof data === 'object' ? Object.keys(data) : null,
    }, 'deposit order response received');

    if (data.resultCode === '0000') {
      const orderNo = data.payOrderNo || '';
      if (!data.upiId) {
        log.warn({
          event: 'bot.deposit.upi_missing',
          ...ctxMeta(ctx),
          orderNo,
          amount: data.totalAmount || amount,
          hasPayURL: Boolean(data?.payURL || data?.payUrl),
          hasPayParams: Boolean(data?.payParams),
          responseKeys: data && typeof data === 'object' ? Object.keys(data) : null,
        }, 'deposit created without upi id');
      }
      const deposit = buildDepositReply({
        orderId: orderNo,
        amount: data.totalAmount || amount,
        upiId: data.upiId || null,
        expiresAt: new Date(),
      });
      const sentMsg = await ctx.api
        .sendMessage(ctx.chat.id, deposit.text, deposit.options)
        .catch((err) => {
          log.error({ event: 'bot.deposit.send_failed', ...ctxMeta(ctx), orderNo, err, response: err?.response?.body || err?.description }, 'failed to send deposit message');
          return null;
        });
      if (orderNo && sentMsg?.message_id) rememberDepositMessage(orderNo, sentMsg.message_id);
      if (!sentMsg) {
        // fallback via reply helper so user still gets something
        return reply(ctx, deposit.text, deposit.options);
      }
      return sentMsg;
    }
    log.warn({
      event: 'bot.deposit.rejected',
      ...ctxMeta(ctx),
      httpStatus: res.status,
      resultCode: data?.resultCode,
      stateInfo: data?.stateInfo,
      error: data?.error,
      responseKeys: data && typeof data === 'object' ? Object.keys(data) : null,
    }, 'deposit order rejected');
    return reply(ctx, '❌ RRPay rejected: ' + escapeHtml(data.stateInfo || data.error || data?.raw?.slice?.(0, 120) || 'unknown'));
  } catch (err) {
    log.error({ event: 'bot.deposit.error', ...ctxMeta(ctx), amount, err }, 'deposit command failed');
    return reply(ctx, '❌ Error: ' + escapeHtml(err.message));
  }
}

async function handleStatus(ctx) {
  const text = (ctx.message?.text || '').trim();
  const args = text.split(/\s+/).slice(1);
  const orderNo = args[0];
  if (!orderNo) return reply(ctx, 'Usage: /status &lt;payOrderNo&gt;');

  try {
    const port = process.env.PORT || 4000;
    log.info({ event: 'bot.status.request', ...ctxMeta(ctx), orderNo }, 'status check requested');
    const res = await fetch(`http://localhost:${port}/pay/${encodeURIComponent(orderNo)}`);
    if (!res.ok) {
      log.warn({ event: 'bot.status.not_found', ...ctxMeta(ctx), orderNo, httpStatus: res.status }, 'order status not found');
      return reply(ctx, 'Order not found: <code>' + escapeHtml(orderNo) + '</code>');
    }
    const data = await res.json();
    const orderId = data.payOrderNo || orderNo;
    const amount = data.totalAmount || '0';
    const status = String(data.status || '').toLowerCase();
    log.info({ event: 'bot.status.response', ...ctxMeta(ctx), orderNo, status, amount }, 'order status fetched');

    if (status === 'success') {
      const deposit = buildDepositReply({
        orderId,
        amount,
        upiId: data.upiId || null,
        expiresAt: new Date(),
        completed: true,
      });
      const messageId = depositMsgIds.get(String(orderNo));
      if (messageId) {
        try {
          await ctx.api.editMessageText(ctx.chat.id, messageId, deposit.text, deposit.options);
          log.info({ event: 'bot.status.edited', ...ctxMeta(ctx), orderNo, status }, 'deposit message updated');
          return;
        } catch (err) {
          log.warn({ event: 'bot.status.edit_failed', ...ctxMeta(ctx), orderNo, err }, 'failed to edit deposit message');
        }
      }
      return reply(ctx, deposit.text, deposit.options);
    }

    if (status === 'expired') {
      const deposit = buildDepositReply({
        orderId,
        amount,
        upiId: data.upiId || null,
        expiresAt: new Date(),
        expired: true,
      });
      const messageId = depositMsgIds.get(String(orderNo));
      if (messageId) {
        try {
          await ctx.api.editMessageText(ctx.chat.id, messageId, deposit.text, deposit.options);
          log.info({ event: 'bot.status.edited', ...ctxMeta(ctx), orderNo, status }, 'deposit message updated');
          return;
        } catch (err) {
          log.warn({ event: 'bot.status.edit_failed', ...ctxMeta(ctx), orderNo, err }, 'failed to edit deposit message');
        }
      }
      return reply(ctx, deposit.text, deposit.options);
    }

    const lines = [
      'Order: <code>' + escapeHtml(data.payOrderNo || orderNo) + '</code>',
      'Status: ' + escapeHtml(data.status || '-'),
      'Amount: ' + escapeHtml(String(data.totalAmount ?? '-')) + ' ' + escapeHtml(data.currencyCode || ''),
      'Type: ' + escapeHtml(data.payType || ''),
    ];
    return reply(ctx, lines.join('\n'));
  } catch (err) {
    log.error({ event: 'bot.status.error', ...ctxMeta(ctx), orderNo, err }, 'status command failed');
    return reply(ctx, '❌ Error: ' + escapeHtml(err.message));
  }
}

function register(bot, config) {
  bot.command('balance', async (ctx) => {
    const chat = ctx.chat || {};
    if (chat.type === 'private') return reply(ctx, 'Run /balance inside a registered group.');
    const group = await getRegisteredGroup(chat.id);
    if (!group) return reply(ctx, 'This group is not registered. Owner must run /reg first.');
    const groupDoc = await fetchGroupById(chat.id);
    return reply(
      '💰 Group balance\n' +
      'UID: <code>' + (groupDoc?.uid || group.uid) + '</code>\n' +
      'Group: <code>' + chat.id + '</code>\n' +
      'Status: ' + (group.status || '-') + '\n' +
      'Balance: ' + (group.balance?.toString?.() || '0') + '\n' +
      'ExchangeRate: ' + (groupDoc?.exchangeRate || group.exchangeRate || 1)
    );
  });

  bot.command('d', async (ctx) => safeHandler('d', ctx, async () => {
    log.info({ event: 'bot.command', ...ctxMeta(ctx), command: 'd' }, 'command received');
    const chat = ctx.chat || {};
    if (chat.type === 'private') {
      return reply(ctx, 'Run /d inside a registered group. Deposits belong to a group.');
    }
    const group = await getRegisteredGroup(chat.id);
    if (!group) return reply(ctx, 'This group is not registered. Owner must run /reg first.');
    if (group.status && group.status !== 'active') return reply(ctx, 'Group is ' + escapeHtml(group.status) + '. Contact support.');
    ctx.groupUid = group.uid;
    return handleOrder(ctx, config);
  }));

  bot.command('help', (ctx) => safeHandler('help', ctx, () => {
    log.info({ event: 'bot.command', ...ctxMeta(ctx), command: 'help' }, 'command received');
    return reply(ctx, HELP);
  }));

  bot.command('status', async (ctx) => safeHandler('status', ctx, async () => {
    log.info({ event: 'bot.command', ...ctxMeta(ctx), command: 'status' }, 'command received');
    const chat = ctx.chat || {};
    if (chat.type === 'private') return reply(ctx, 'Run /status inside a registered group.');
    const group = await getRegisteredGroup(chat.id);
    if (!group) return reply(ctx, 'This group is not registered. Owner must run /reg first.');
    return handleStatus(ctx);
  }));

  bot.command('start', (ctx) => safeHandler('start', ctx, () => {
    log.info({ event: 'bot.command', ...ctxMeta(ctx), command: 'start' }, 'command received');
    return reply(ctx, HELP);
  }));

  bot.command('reg', async (ctx) => {
    const from = ctx.from || {};
    if (!isOwner(from, config)) return reply(ctx, 'Only the owner can register a group.');
    const chat = ctx.chat || {};
    if (chat.type === 'private') return reply(ctx, 'Run /reg inside the group you want to register.');
    try {
      const port = process.env.PORT || 4000;
      const res = await fetch(`http://localhost:${port}/groups/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupId: chat.id, groupName: chat.title || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return reply(ctx, `❌ ${data.error || 'registration failed'}`);
      return reply(ctx, `✅ Group registered.\nUID: <code>${data.uid}</code>\nChat ID: <code>${chat.id}</code>\nTitle: ${chat.title || '-'}`);
    } catch (err) {
      return reply(ctx, `❌ Error: ${err.message}`);
    }
  });

  bot.command('gmsg', async (ctx) => {
    const from = ctx.from || {};
    if (!isOwner(from, config)) return reply(ctx, 'Only the owner can use /gmsg.');
    const text = (ctx.message?.text || '').trim().split(/\s+/).slice(1).join(' ');
    if (!text) return reply(ctx, 'Usage: /gmsg <message>');
    return reply(ctx, '📢 ' + text);
  });

  bot.command('md', async (ctx) => {
    const from = ctx.from || {};
    if (!isOwner(from, config)) return reply(ctx, 'Only the owner can use /md.');
    return reply(ctx, 'Maintenance toggled (owner only).');
  });

  return true;
}

export { register, handleOrder, handleStatus, HELP, reply, getRegisteredGroup, fetchGroupById };
