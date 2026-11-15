import { isOwner } from './config.js';

const HELP = (owner) =>
  [
    'RRPAY Bot',
    '',
    '/start - show this help',
    '/help - show this help',
    '/order <amount> - create a payin order (e.g. /order 100.00)',
    '/status <payOrderNo> - check an order',
    owner ? '/reg - register this group (owner only, run inside the group)' : null,
    owner ? '/gmsg <text> - send a message (owner only)' : null,
    owner ? '/md - toggle maintenance (owner only)' : null,
  ]
    .filter(Boolean)
    .join('\n');

async function handleOrder(ctx) {
  const args = (ctx.message?.text || '').trim().split(/\s+/).slice(1);
  const amount = args[0];
  if (!amount) return ctx.reply('Usage: /order <amount> (e.g. /order 100.00)');

  try {
    const port = process.env.PORT || 4000;
    const res = await fetch(`http://localhost:${port}/payin/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount }),
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

  bot.command('order', (ctx) => {
    const chat = ctx.chat || {};
    const from = ctx.from || {};
    if (chat.type === 'private' && !isOwner(from, config)) {
      return ctx.reply('This bot is for the owner only.');
    }
    return handleOrder(ctx);
  });

  bot.command('status', (ctx) => {
    const chat = ctx.chat || {};
    const from = ctx.from || {};
    if (chat.type === 'private' && !isOwner(from, config)) {
      return ctx.reply('This bot is for the owner only.');
    }
    return handleStatus(ctx);
  });

  bot.command('reg', (ctx) => {
    const from = ctx.from || {};
    if (!isOwner(from, config)) return ctx.reply('Only the owner can register a group.');
    const chat = ctx.chat || {};
    return ctx.reply(
      `Group registered.\nChat ID: <code>${chat.id}</code>\nTitle: ${chat.title || '-'}`,
      { parse_mode: 'HTML' }
    );
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
