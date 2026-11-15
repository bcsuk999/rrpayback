import { isOwner } from './config.js';

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
    'RRPAY Bot',
    '',
    '/start - show this help',
    '/help - show this help',
    '/d <amount> - create a payin order (e.g. /order 100.00)',
    '/status <payOrderNo> - check an order',
    owner ? '/reg - register this group (owner only, run inside the group)' : null,
    owner ? '/gmsg <text> - send a message (owner only)' : null,
    owner ? '/md - toggle maintenance (owner only)' : null,
  ]
    .filter(Boolean)
    .join('\n');

async function handleOrder(ctx, config) {
  // Resolve group uid if running inside a registered group.
  const chat = ctx.chat || {};
  if (chat.type !== 'private') {
    try {
      const port = process.env.PORT || 4000;
      const r = await fetch(`http://localhost:${port}/groups/${chat.id}`);
      if (r.ok) { const d = await r.json(); ctx.groupUid = d.uid; }
    } catch (_) {}
  }
  const args = (ctx.message?.text || '').trim().split(/\s+/).slice(1);
  const amount = args[0];
  if (!amount) return ctx.reply('Usage: /d <amount> (e.g. /order 100.00)');

  try {
    const port = process.env.PORT || 4000;
    const res = await fetch(`http://localhost:${port}/payin/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount, groupId: (ctx.chat?.type !== 'private' ? ctx.chat?.id : undefined), uid: ctx.groupUid }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.resultCode === '0000') {
      const lines = [
        '✅ Order created',
        `Order: <code>${data.payOrderNo}</code>`,
        `Amount: ${data.totalAmount}`,
        `Pay URL: ${data.payURL}`,
      ];
      return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    }
    return ctx.reply(`❌ RRPay rejected: ${data.stateInfo || data.error || 'unknown'}`);
  } catch (err) {
    return ctx.reply(`❌ Error: ${err.message}`);
  }
}

async function handleStatus(ctx) {
  const args = (ctx.message?.text || '').trim().split(/\s+/).slice(1);
  const orderNo = args[0];
  if (!orderNo) return ctx.reply('Usage: /status <payOrderNo>');

  try {
    const port = process.env.PORT || 4000;
    const res = await fetch(`http://localhost:${port}/pay/${orderNo}`);
    if (!res.ok) return ctx.reply(`Order not found: ${orderNo}`);
    const data = await res.json();
    const lines = [
      `Order: <code>${data.payOrderNo}</code>`,
      `Status: ${data.status}`,
      `Amount: ${data.totalAmount} ${data.currencyCode || ''}`,
      `Type: ${data.payType || ''}`,
    ];
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  } catch (err) {
    return ctx.reply(`❌ Error: ${err.message}`);
  }
}

export function register(bot, config) {
  bot.command('start', (ctx) => {
    const owner = isOwner(ctx.from, config);
    return ctx.reply(HELP(owner));
  });

  bot.command('help', (ctx) => {
    const owner = isOwner(ctx.from, config);
    return ctx.reply(HELP(owner));
  });

  bot.command('d', async (ctx) => {
    const chat = ctx.chat || {};
    const from = ctx.from || {};
    if (chat.type === 'private' && !isOwner(from, config)) {
      return ctx.reply('This bot is for the owner only.');
    }
    if (chat.type !== 'private') {
      const group = await getRegisteredGroup(chat.id);
      if (!group) return ctx.reply('This group is not registered. Owner must run /reg first.');
      if (group.status && group.status !== 'active') return ctx.reply(`Group is ${group.status}. Contact support.`);
      ctx.groupUid = group.uid;
    }
    return handleOrder(ctx, config);
  });

  bot.command('status', async (ctx) => {
    const chat = ctx.chat || {};
    const from = ctx.from || {};
    if (chat.type === 'private' && !isOwner(from, config)) {
      return ctx.reply('This bot is for the owner only.');
    }
    if (chat.type !== 'private') {
      const group = await getRegisteredGroup(chat.id);
      if (!group) return ctx.reply('This group is not registered. Owner must run /reg first.');
    }
    return handleStatus(ctx);
  });

  bot.command('reg', async (ctx) => {
    const from = ctx.from || {};
    if (!isOwner(from, config)) return ctx.reply('Only the owner can register a group.');
    const chat = ctx.chat || {};
    if (chat.type === 'private') return ctx.reply('Run /reg inside the group you want to register.');

    try {
      const port = process.env.PORT || 4000;
      // Generate a 5-digit uid
      let uid = String(Math.floor(10000 + Math.random() * 90000));
      // Persist via a small helper endpoint? We'll call a local API.
      const res = await fetch(`http://localhost:${port}/groups/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ groupId: chat.id, groupName: chat.title || '', uid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return ctx.reply(`❌ ${data.error || 'registration failed'}`);
      return ctx.reply(
        `✅ Group registered.\nUID: <code>${data.uid}</code>\nChat ID: <code>${chat.id}</code>\nTitle: ${chat.title || '-'}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      return ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  bot.command('gmsg', (ctx) => {
    const from = ctx.from || {};
    if (!isOwner(from, config)) return ctx.reply('Only the owner can use /gmsg.');
    const text = (ctx.message?.text || '').trim().split(/\s+/).slice(1).join(' ');
    if (!text) return ctx.reply('Usage: /gmsg <message>');
    return ctx.reply(`📢 ${text}`);
  });

  bot.command('md', (ctx) => {
    const from = ctx.from || {};
    if (!isOwner(from, config)) return ctx.reply('Only the owner can use /md.');
    return ctx.reply('Maintenance toggled (owner only).');
  });

  // Fallback for non-command messages in private chats.
  bot.on('message', (ctx) => {
    const chat = ctx.chat || {};
    const from = ctx.from || {};
    const text = ctx.message?.text || '';
    if (chat.type === 'private' && !text.startsWith('/')) {
      if (!isOwner(from, config)) return ctx.reply('This bot is for the owner only.');
      return ctx.reply(HELP(true));
    }
  });

  return true;
}
