const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function write(level, arg1, arg2) {
  if ((LEVELS[level] ?? 20) < currentLevel) return;
  let meta = {};
  let msg;
  if (typeof arg1 === 'string') {
    msg = arg1;
  } else if (arg1 && typeof arg1 === 'object') {
    meta = arg1 instanceof Error ? { err: serializeError(arg1) } : { ...arg1 };
    msg = typeof arg2 === 'string' ? arg2 : undefined;
  }

  const entry = {
    level: level.toUpperCase(),
    time: new Date().toISOString(),
    ...(msg ? { msg } : {}),
    ...serializeMeta(meta),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function serializeError(err) {
  if (!err || typeof err !== 'object') return err;
  return {
    type: err.name,
    message: err.message,
    stack: err.stack,
    code: err.code,
    cause: err.cause?.message || err.cause,
  };
}

function serializeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v instanceof Error) out[k] = serializeError(v);
    else out[k] = v;
  }
  return out;
}

const logger = {
  debug: (a, b) => write('debug', a, b),
  info: (a, b) => write('info', a, b),
  warn: (a, b) => write('warn', a, b),
  error: (a, b) => write('error', a, b),
  child(bindings = {}) {
    const bind = (level) => (a, b) => {
      if (typeof a === 'string') return logger[level]({ ...bindings }, a);
      if (a && typeof a === 'object') return logger[level]({ ...bindings, ...a }, b);
      return logger[level]({ ...bindings }, b);
    };
    return {
      debug: bind('debug'),
      info: bind('info'),
      warn: bind('warn'),
      error: bind('error'),
    };
  },
};

export default logger;
