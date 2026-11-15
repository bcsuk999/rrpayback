import { isOwner } from './config.js';

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

const HELP = (owner) =>
  [
    '🤖 RRPAY Bot',
    '',
    '👤 /balance - show group balance',
    '👤 /d <amount> - create a payin order (e.g. /d 100.00)',
    '👤 /help - show available commands',
    '👤 /status <payOrderNo> - check an order',
    owner ? '📢 /reg - register group (owner only)' : '',
    owner ? '📢 /gmsg <msg> - send a message (owner only)' : '',
    owner ? '📢 /md - toggle maintenance (owner only)' : '',
  ]
    .filter((line) => line.length > 0)
    .join('\n');

async function reply(ctx, text) {
  try {
    return await ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[bot] send failed:', err?.message);
  }
}

async function handleOrder(ctx, config) {
  const chat = ctx.chat || {};
  const text = (ctx.message?.text || '').trim();
  const args = text.split(/\s+/).slice(1);
  const amount = args[0];
  if (!amount) return reply(ctx, 'Usage: /d <amount> (e.g. /d 100.00)');

  try {
    const port = process.env.PORT || 4000;
    const res = await fetch(`http://localhost:${port}/payin/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount, groupId: chat?.id, uid: ctx.groupUid }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.resultCode === '0000') {
      const lines = [
        '✅ Order created',
        'Order: <code>' + (data.payOrderNo || '') + '</code>',
        'Amount: ' + (data.totalAmount || amount),
        'Pay URL: ' + (data.payURL || '-'),
      ];
      return reply(ctx, lines.join('\n'));
    }
    return reply(ctx, '❌ RRPay rejected: ' + (data.stateInfo || data.error || 'unknown'));
  } catch (err) {
    return reply(ctx, '❌ Error: ' + err.message);
  }
}

async function handleStatus(ctx) {
  const text = (ctx.message?.text || '').trim();
  const args = text.split(/\s+/).slice(1);
  const orderNo = args[0];
  if (!orderNo) return reply(ctx, 'Usage: /status <payOrderNo>');

  try {
    const port = process.env.PORT || 4000;
    const res = await fetch(`http://localhost:${port}/pay/${orderNo}`);
    if (!res.ok) return reply(ctx, 'Order not found: ' + orderNo);
    const data = await res.json();
    const lines = [
      'Order: <code>' + (data.payOrderNo || orderNo) + '</code>',
      'Status: ' + (data.status || '-'),
      'Amount: ' + (data.totalAmount || '-') + ' ' + (data.currencyCode || ''),
      'Type: ' + (data.payType || ''),
    ];
    return reply(ctx, lines.join('\n'));
  } catch (err) {
    return reply(ctx, '❌ Error: ' + err.message);
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

  bot.command('d', async (ctx) => {
    const chat = ctx.chat || {};
    if (chat.type === 'private') {
      return reply(ctx, 'Run /d inside a registered group. Deposits belong to a group.');
    }
    const group = await getRegisteredGroup(chat.id);
    if (!group) return reply(ctx, 'This group is not registered. Owner must run /reg first.');
    if (group.status && group.status !== 'active') return reply(ctx, 'Group is ' + group.status + '. Contact support.');
    ctx.groupUid = group.uid;
    return handleOrder(ctx, config);
  });

  bot.command('help', (ctx) => reply(ctx, HELP(false)));

  bot.command('status', async (ctx) => {
    const chat = ctx.chat || {};
    if (chat.type === 'private') return reply(ctx, 'Run /status inside a registered group.');
    const group = await getRegisteredGroup(chat.id);
    if (!group) return reply(ctx, 'This group is not registered. Owner must run /reg first.');
    return handleStatus(ctx);
  });

  bot.command('start', (ctx) => reply(ctx, HELP(false)));

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
