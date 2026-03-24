import {config} from '../config.js';

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[config.logLevel];
}

function buildPayload(scope, message, meta) {
  const payload = {
    ts: new Date().toISOString(),
    level: meta?.level,
    scope,
    message,
  };

  if (meta && Object.keys(meta).length > 0) {
    const nextMeta = {...meta};
    delete nextMeta.level;
    if (Object.keys(nextMeta).length > 0) {
      payload.meta = nextMeta;
    }
  }

  return JSON.stringify(payload);
}

function log(level, scope, message, meta = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const line = buildPayload(scope, message, {...meta, level});

  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(line);
}

export function createLogger(scope) {
  return {
    debug(message, meta) {
      log('debug', scope, message, meta);
    },
    info(message, meta) {
      log('info', scope, message, meta);
    },
    warn(message, meta) {
      log('warn', scope, message, meta);
    },
    error(message, meta) {
      log('error', scope, message, meta);
    },
  };
}
