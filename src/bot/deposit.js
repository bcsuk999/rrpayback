const DEPOSIT_EXPIRY_MINUTES = 20;
const EXPIRED_LINE_TEXT = 'Expires at: already expired 🔴';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(amount) {
  const n = Number(amount);
  const fixed = Number.isFinite(n) ? n.toFixed(2) : '0.00';
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatInr(amount) {
  return '₹' + formatAmount(amount);
}

function formatExpiryIst(date) {
  const time = date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const datePart = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  return `${time.toLowerCase()} ${datePart}`;
}

function buildDepositReply({ orderId, amount, upiId, expiresAt, expired = false, completed = false }) {
  const expiry =
    expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
      ? expiresAt
      : new Date(Date.now() + DEPOSIT_EXPIRY_MINUTES * 60 * 1000);

  const expiryLine = expired
    ? EXPIRED_LINE_TEXT
    : `Expires at: ${formatExpiryIst(expiry)} [${DEPOSIT_EXPIRY_MINUTES} minutes]`;

  const lines = [];
  if (completed) lines.push('status : order completed 🟢');
  lines.push(
    `Order ID: <code>${escapeHtml(orderId)}</code>`,
    `Amount to pay: ${formatInr(amount)}`,
    `UPI ID: ${upiId ? `<code>${escapeHtml(upiId)}</code>` : 'unavailable'}`,
    expiryLine,
    '',
    '⚠️ Do not use the same order for multiple payments.',
  );

  const text = lines.join('\n');

  const keyboard = [
    [{ text: 'Copy amount', copy_text: { text: formatAmount(amount).replace(/,/g, '') } }],
  ];
  if (upiId) keyboard.push([{ text: 'Copy UPI ID', copy_text: { text: String(upiId) } }]);

  return {
    text,
    options: {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard },
    },
  };
}

function buildSuccessNotice({ orderId, amount, direction }) {
  const type = direction === 'debit' ? 'PAYOUT🔺' : 'PAYIN🔻';
  const safeOrderId = escapeHtml(orderId);
  const text = [
    'Order completed 💕',
    '',
    'Order type: Payment Order',
    `type: ${type}`,
    `Order No: <code>${safeOrderId}</code>`,
    'Status: Completed✅',
    `Amount: ${formatAmount(amount)}`,
  ].join('\n');

  const options = {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: 'Copy Order No', copy_text: { text: String(orderId) } }]],
    },
  };

  return { text, options };
}

export {
  DEPOSIT_EXPIRY_MINUTES,
  EXPIRED_LINE_TEXT,
  buildDepositReply,
  buildSuccessNotice,
  escapeHtml,
  formatAmount,
  formatInr,
  formatExpiryIst,
};
