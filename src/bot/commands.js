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

async function reply(client, chatId, text) {
  try {
    await client.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[bot] send failed:', err?.message);
  }
}

function parseCommand(text) {
  if (typeof text !== 'string' || !text.startsWith('/')) return null;
  const [raw, ...args] = text.trim().split(/\s+/);
  const command = raw.toLowerCase().split('@')[0];
  return { command, args };
}

async function handleOrder(ctx, client) {
  const { chat, args } = ctx;
  const amount = args[0];
  if (!amount) return reply(client, chat.id, 'Usage: /order <amount> (e.g. /order 100.00)');

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
      return reply(client, chat.id, lines.join('\n'));
    }
    return reply(
      client,
      chat.id,
      `❌ RRPay rejected: ${data.stateInfo || data.error || 'unknown'}`
    );
  } catch (err) {
    return reply(client, chat.id, `❌ Error: ${err.message}`);
  }
}

async function handleStatus(ctx, client) {
  const { chat, args } = ctx;
  const orderNo = args[0];
  if (!orderNo) return reply(client, chat.id, 'Usage: /status <payOrderNo>');

  try {
    const port = process.env.PORT || 4000;
    const res = await fetch(`http://localhost:${port}/pay/${orderNo}`);
    if (!res.ok) return reply(client, chat.id, `Order not found: ${orderNo}`);
    const data = await res.json();
    const lines = [
      `Order: <code>${data.payOrderNo}</code>`,
      `Status: ${data.status}`,
      `Amount: ${data.totalAmount} ${data.currencyCode || ''}`,
      `Type: ${data.payType || ''}`,
    ];
    return reply(client, chat.id, lines.join('\n'));
  } catch (err) {
    return reply(client, chat.id, `❌ Error: ${err.message}`);
  }
}

export async function handleMessage(msg, client, config) {
  const chat = msg.chat || {};
  const from = msg.from || {};
  const text = msg.text || '';
  const parsed = parseCommand(text);

  const owner = isOwner(from, config);

  // Private chats: owner only.
  if (chat.type === 'private' && !owner) {
    return reply(client, chat.id, 'This bot is for the owner only.');
  }

  if (!parsed) {
    if (chat.type === 'private') return reply(client, chat.id, HELP(owner));
    return;
  }

  const { command, args } = parsed;
  const ctx = { chat, from, args, command, owner };

  switch (command) {
    case '/start':
    case '/help':
      return reply(client, chat.id, HELP(owner));
    case '/order':
      return handleOrder(ctx, client);
    case '/status':
      return handleStatus(ctx, client);
    case '/reg':
      if (!owner) return reply(client, chat.id, 'Only the owner can register a group.');
      return reply(
        client,
        chat.id,
        `Group registered.\nChat ID: <code>${chat.id}</code>\nTitle: ${chat.title || '-'}`
      );
    case '/gmsg':
      if (!owner) return reply(client, chat.id, 'Only the owner can use /gmsg.');
      const msgText = args.join(' ').trim();
      if (!msgText) return reply(client, chat.id, 'Usage: /gmsg <message>');
      return reply(client, chat.id, `📢 ${msgText}`);
    case '/md':
      if (!owner) return reply(client, chat.id, 'Only the owner can use /md.');
      return reply(client, chat.id, 'Maintenance toggled (owner only).');
    default:
      return reply(client, chat.id, `Unknown command. Try /help`);
  }
}

export function register(client, config) {
  client.on('message', (msg) => {
    handleMessage(msg, client, config).catch((err) =>
      console.error('[bot] unhandled message error:', err?.message)
    );
  });
  return true;
}
