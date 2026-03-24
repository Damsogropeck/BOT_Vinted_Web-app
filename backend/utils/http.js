import {config} from '../config.js';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'HttpRequestError';
    this.status = options.status ?? null;
    this.url = options.url ?? '';
    this.retryable = Boolean(options.retryable);
    this.cause = options.cause;
  }
}

function getRandomInt(min, max) {
  if (max <= min) {
    return min;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function sleep(ms) {
  if (!ms || ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sleepRandom(minMs, maxMs) {
  await sleep(getRandomInt(Math.max(0, minMs), Math.max(0, maxMs)));
}

function isRetryableError(error) {
  if (error instanceof HttpRequestError) {
    return error.retryable;
  }

  return true;
}

export async function fetchText(url, options = {}) {
  const retries = Math.max(0, options.retries ?? config.httpRetries);
  const timeoutMs = Math.max(1000, options.timeoutMs ?? config.httpTimeoutMs);
  const retryBaseDelayMs = Math.max(50, options.retryBaseDelayMs ?? config.httpRetryBaseDelayMs);

  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          ...DEFAULT_HEADERS,
          ...(options.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HttpRequestError(`HTTP ${response.status} while fetching ${url}`, {
          status: response.status,
          url,
          retryable: RETRYABLE_STATUS.has(response.status),
        });
      }

      return await response.text();
    } catch (error) {
      const normalizedError =
        error instanceof HttpRequestError
          ? error
          : new HttpRequestError(`Network error while fetching ${url}`, {
              url,
              retryable: true,
              cause: error,
            });

      if (attempt >= retries || !isRetryableError(normalizedError)) {
        throw normalizedError;
      }

      const backoffMs = retryBaseDelayMs * (attempt + 1) + getRandomInt(50, 250);
      await sleep(backoffMs);
      attempt += 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new HttpRequestError(`Unexpected fetch failure for ${url}`, {url, retryable: false});
}
