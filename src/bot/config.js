export function loadConfig(env = process.env) {
  const token = env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '';
  const rawOwner = env.owner_TG_id || env.TELEGRAM_OWNER_ID || env.OWNER_TG_ID || '';
  const ownerId = rawOwner && /^-?\d+$/.test(String(rawOwner).trim())
    ? Number(String(rawOwner).trim())
    : null;

  return {
    enabled: Boolean(token && ownerId),
    token,
    ownerId,
    mode: 'polling',
  };
}

export function validateConfig(config) {
  const problems = [];
  if (!config.token) problems.push('BOT_TOKEN is missing');
  if (!config.ownerId || !Number.isFinite(config.ownerId))
    problems.push('owner_TG_id is missing or not a number');
  return problems;
}

export function isOwner(from, config) {
  return Boolean(
    config?.ownerId &&
      from?.id != null &&
      Number(from.id) === Number(config.ownerId)
  );
}
