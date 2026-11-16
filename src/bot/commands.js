import { isOwner } from './config.js';
import { buildDepositReply, DEPOSIT_EXPIRY_MINUTES } from './deposit.js';
import logger from '../utils/logger.js';
import Payin from '../models/Payin.js';
import Group from '../models/Group.js';

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

function formatUser(from) {
  if (!from) return '-';
  const parts = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
  const username = from.username ? `@${from.username}` : '';
  const id = from.id != null ? `(${from.id})` : '';
  return [parts || username || 'Unknown', username && parts ? username : '', id].filter(Boolean).join(' ').trim();
}

async function notifyOwnerError(ctx, config, details = {}) {
  const ownerId = config?.ownerId;
  if (!ownerId || !ctx?.api?.sendMessage) {
    log.warn({ event: 'bot.owner_notify.skipped', ...ctxMeta(ctx), reason: 'missing_owner_or_api' }, 'owner notify skipped');
    return;
  }
  const lines = [
    '⚠️ Command error',
    `Group: ${escapeHtml(details.groupName || ctx?.chat?.title || String(ctx?.chat?.id || '-'))}`,
    `Group ID: ${escapeHtml(String(ctx?.chat?.id ?? '-'))}`,
    `User: ${escapeHtml(details.userName || formatUser(ctx?.from))}`,
    `Command: ${escapeHtml(details.command || ctx?.message?.text || '-')}`,
  ];
  if (details.orderId) lines.push(`Order ID: <code>${escapeHtml(details.orderId)}</code>`);
  if (details.payUrl) lines.push(`Pay URL: ${escapeHtml(details.payUrl)}`);
  if (details.error) lines.push(`Error: ${escapeHtml(details.error)}`);
  const text = lines.join('\n');
  try {
    await ctx.api.sendMessage({
      chat_id: ownerId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    log.info({ event: 'bot.owner_notify.sent', ...ctxMeta(ctx), ownerId, orderId: details.orderId || null }, 'owner notified of command error');
  } catch (err) {
    log.error({
      event: 'bot.owner_notify.failed',
      ...ctxMeta(ctx),
      ownerId,
      error: err?.message,
      description: err?.response?.body?.description || err?.description,
      response: err?.response?.body || err?.description,
    }, 'failed to notify owner');
  }
}

function isGroupChat(ctx) {
  const t = ctx?.chat?.type;
  return t === 'group' || t === 'supergroup';
}

function fmtDate(value) {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST';
  } catch {
    return d.toISOString();
  }
}

function fmtAmount(value) {
  if (value == null) return '-';
  if (typeof value === 'object' && typeof value.toString === 'function') return value.toString();
  return String(value);
}

async function reportCommandError(ctx, config, details = {}, fallbackToGroup = '⚠️ Something went wrong. Owner has been notified.') {
  log.warn({ event: 'bot.command.error_reported', ...ctxMeta(ctx), ...details }, 'command error reported');
  if (isGroupChat(ctx)) {
    await notifyOwnerError(ctx, config, details);
    return fallbackToGroup;
  }
  // In private chats, show the actual error (useful for owner/debug)
  return details.userMessage || `❌ ${escapeHtml(details.error || 'Error')}`;
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
const Q_LINE = '/q <order id> - Get full order details (owner DM only)';

// Telegram message ids of the deposit slips sent by /d, keyed by payOrderNo (for edit-in-place).
const depositMsgIds = new Map();
let _config = null;

function rememberDepositMessage(orderNo, messageId) {
  if (orderNo && messageId) depositMsgIds.set(String(orderNo), messageId);
}

function forgetDepositMessage(orderNo) {
  if (orderNo) depositMsgIds.delete(String(orderNo));
}

function helpText({ owner = false } = {}) {
  const lines = ['Commands:'];
  if (owner) lines.push(REG_LINE, INFO_LINE, PL_LINE, MD_LINE, Q_LINE);
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
      if (isGroupChat(ctx)) {
        await notifyOwnerError(ctx, _config, {
          command: ctx?.message?.text || name,
          error: err?.message || 'Internal error',
        });
        await reply(ctx, '⚠️ Something went wrong. Owner has been notified.');
      } else {
        await reply(ctx, '❌ Internal error. Please try again later.');
      }
    } catch (_) {}
  }
}

async function handleOrder(ctx, config) {
  const chat = ctx.chat || {};
  const text = (ctx.message?.text || '').trim();
  const args = text.split(/\s+/).slice(1);
  const amount = args[0];
  if (!amount) return reply(ctx, 'Usage: /d &lt;amount&gt; (e.g. /d 100.00)');

  // Send processing message first, then edit with result
  let processingMsg = null;
  try {
    processingMsg = await reply(ctx, 'Request processing...');
  } catch (_) {
    // reply() already logs; continue without processing message
  }

  const editOrSend = async (msgText, options) => {
    const opts = options ?? { parse_mode: 'HTML' };
    if (processingMsg?.message_id) {
      try {
        return await ctx.api.editMessageText({
          chat_id: chat.id,
          message_id: processingMsg.message_id,
          text: msgText,
          ...opts,
        });
      } catch (err) {
        log.warn({ event: 'bot.deposit.edit_failed', ...ctxMeta(ctx), error: err?.message, response: err?.response?.body || err?.description }, 'failed to edit processing message');
      }
    }
    return reply(ctx, msgText, opts);
  };

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
      const displayAmount = data.deeplinkAmount || data.totalAmount || amount;
      const upiId = data.upiId || null;

      // Do not send deposit slip unless UPI ID and amount are available from deeplink
      if (!upiId || !data.deeplinkAmount) {
        const reason = data.reason || data.stateInfo || 'UPI/deeplink data missing';
        const payUrl = data.payURL || data.payUrl || '';
        log.warn({
          event: 'bot.deposit.missing_deeplink_data',
          ...ctxMeta(ctx),
          orderNo,
          upiIdPresent: Boolean(upiId),
          deeplinkAmount: data.deeplinkAmount || null,
          totalAmount: data.totalAmount || null,
          hasPayURL: Boolean(payUrl),
          reason,
        }, 'deposit order missing deeplink upi/amount; not sending slip');
        const groupMsg = await reportCommandError(ctx, config, {
          command: ctx?.message?.text || '/d',
          error: reason,
          orderId: orderNo || null,
          payUrl: payUrl || null,
        }, '⚠️ Deposit could not be created. Owner has been notified.');
        // In private/owner chat show details
        if (!isGroupChat(ctx)) {
          const lines = [`❌ ${escapeHtml(reason)}`];
          if (payUrl) lines.push(`Pay URL: ${escapeHtml(payUrl)}`);
          return editOrSend(lines.join('\n'));
        }
        return editOrSend(groupMsg);
      }

      const deposit = buildDepositReply({
        orderId: orderNo,
        amount: displayAmount,
        upiId,
        expiresAt: new Date(),
      });
      const sentMsg = await editOrSend(deposit.text, deposit.options);
      if (orderNo && (sentMsg?.message_id || processingMsg?.message_id)) {
        rememberDepositMessage(orderNo, sentMsg?.message_id || processingMsg.message_id);
      }
      return sentMsg;
    }

    const reason = data.reason || data.stateInfo || data.error || data?.raw?.slice?.(0, 120) || 'unknown';
    const payUrl = data.payURL || data.payUrl || '';
    const orderId = data.payOrderNo || null;
    log.warn({
      event: 'bot.deposit.rejected',
      ...ctxMeta(ctx),
      httpStatus: res.status,
      resultCode: data?.resultCode,
      stateInfo: data?.stateInfo,
      reason,
      error: data?.error,
      payURL: payUrl || null,
      orderId,
      responseKeys: data && typeof data === 'object' ? Object.keys(data) : null,
    }, 'deposit order rejected');
    const groupMsg = await reportCommandError(ctx, config, {
      command: ctx?.message?.text || '/d',
      error: reason,
      orderId,
      payUrl: payUrl || null,
    }, '⚠️ Deposit could not be created. Owner has been notified.');
    if (!isGroupChat(ctx)) {
      const lines = [`❌ ${escapeHtml(reason)}`];
      if (payUrl) lines.push(`Pay URL: ${escapeHtml(payUrl)}`);
      return editOrSend(lines.join('\n'));
    }
    return editOrSend(groupMsg);
  } catch (err) {
    log.error({ event: 'bot.deposit.error', ...ctxMeta(ctx), amount, err }, 'deposit command failed');
    const groupMsg = await reportCommandError(ctx, config, {
      command: ctx?.message?.text || '/d',
      error: err?.message || 'Unknown error',
    }, '⚠️ Deposit could not be created. Owner has been notified.');
    if (!isGroupChat(ctx)) {
      return editOrSend('❌ Error: ' + escapeHtml(err?.message || 'Unknown error'));
    }
    return editOrSend(groupMsg);
  }
}

async function handleQ(ctx, config) {
  if (!isOwner(ctx?.from, config)) return reply(ctx, 'Only the owner can use /q.');
  if (ctx?.chat?.type !== 'private') return reply(ctx, 'Run /q in a private chat with the bot.');

  const text = (ctx.message?.text || '').trim();
  const args = text.split(/\s+/).slice(1);
  const orderNo = args[0];
  if (!orderNo) return reply(ctx, 'Usage: /q &lt;orderId&gt;');

  try {
    log.info({ event: 'bot.q.request', ...ctxMeta(ctx), orderNo }, 'q command requested');
    const payin = await Payin.findOne({ payOrderNo: orderNo }).lean();
    if (!payin) {
      log.warn({ event: 'bot.q.not_found', ...ctxMeta(ctx), orderNo }, 'order not found for q');
      return reply(ctx, 'Order not found: <code>' + escapeHtml(orderNo) + '</code>');
    }

    let groupUid = '-';
    let groupId = payin.groupId ?? '-';
    try {
      if (payin.group) {
        const g = await Group.findById(payin.group).lean();
        if (g) {
          groupUid = g.uid || groupUid;
          if (groupId === '-' || groupId == null) groupId = g.groupId ?? groupId;
        }
      } else if (payin.groupId != null) {
        const g = await Group.findOne({ groupId: payin.groupId }).lean();
        if (g) groupUid = g.uid || groupUid;
      }
    } catch (_) {
      // best-effort group resolution
    }
    if (groupUid === '-' && payin.uid) groupUid = payin.uid;

    const amount = payin.deeplinkAmount || fmtAmount(payin.totalAmount);
    const upi = payin.upiId || '-';
    const createdAt = fmtDate(payin.createdAt);
    const successAt = payin.status === 'success' ? fmtDate(payin.paidAt || payin.updatedAt) : '-';
    const balanceAfter = '-'; // not tracked on Payin
    const payUrl = payin.payURL || '-';
    const status = payin.status || '-';

    const lines = [
      '<b>Order Details</b>',
      'Group UID: <code>' + escapeHtml(groupUid) + '</code>',
      'Group ID: <code>' + escapeHtml(String(groupId ?? '-')) + '</code>',
      'Order ID: <code>' + escapeHtml(payin.payOrderNo || orderNo) + '</code>',
      'Status: ' + escapeHtml(status),
      'UPI: <code>' + escapeHtml(upi) + '</code>',
      'Amount: <code>' + escapeHtml(String(amount ?? '-')) + '</code>',
      'Created at: ' + escapeHtml(createdAt),
      'Success at: ' + escapeHtml(successAt),
      'Balance after: ' + escapeHtml(balanceAfter),
      'Pay URL: ' + (payUrl !== '-' ? escapeHtml(payUrl) : '-'),
    ];

    log.info({ event: 'bot.q.success', ...ctxMeta(ctx), orderNo: payin.payOrderNo, status }, 'q command served');
    return reply(ctx, lines.join('\n'), { parse_mode: 'HTML', disable_web_page_preview: true });
  } catch (err) {
    log.error({ event: 'bot.q.error', ...ctxMeta(ctx), orderNo, err }, 'q command failed');
    return reply(ctx, '❌ Error: ' + escapeHtml(err?.message || 'Unknown error'));
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
    const amount = data.deeplinkAmount || data.totalAmount || '0';
    const upiId = data.upiId || null;
    const status = String(data.status || '').toLowerCase();
    log.info({ event: 'bot.status.response', ...ctxMeta(ctx), orderNo, status, amount, upiIdPresent: Boolean(upiId) }, 'order status fetched');

    if (status === 'success') {
      const deposit = buildDepositReply({
        orderId,
        amount,
        upiId,
        expiresAt: new Date(),
        completed: true,
      });
      const messageId = depositMsgIds.get(String(orderNo));
      if (messageId) {
        try {
          await ctx.api.editMessageText({
            chat_id: ctx.chat.id,
            message_id: messageId,
            text: deposit.text,
            ...deposit.options,
          });
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
        upiId,
        expiresAt: new Date(),
        expired: true,
      });
      const messageId = depositMsgIds.get(String(orderNo));
      if (messageId) {
        try {
          await ctx.api.editMessageText({
            chat_id: ctx.chat.id,
            message_id: messageId,
            text: deposit.text,
            ...deposit.options,
          });
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
    if (isGroupChat(ctx)) {
      await notifyOwnerError(ctx, _config, {
        command: ctx?.message?.text || '/status',
        error: err?.message || 'Unknown error',
        orderId: orderNo,
      });
      return reply(ctx, '⚠️ Could not fetch status. Owner has been notified.');
    }
    return reply(ctx, '❌ Error: ' + escapeHtml(err.message));
  }
}

function register(bot, config) {
  _config = config;
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
    const ownerDm = isOwner(ctx.from, config) && ctx.chat?.type === 'private';
    return reply(ctx, helpText({ owner: ownerDm }));
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
    const ownerDm = isOwner(ctx.from, config) && ctx.chat?.type === 'private';
    return reply(ctx, helpText({ owner: ownerDm }));
  }));

  bot.command('q', async (ctx) => safeHandler('q', ctx, async () => {
    log.info({ event: 'bot.command', ...ctxMeta(ctx), command: 'q' }, 'command received');
    return handleQ(ctx, config);
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

export { register, handleOrder, handleStatus, handleQ, HELP, reply, getRegisteredGroup, fetchGroupById };
