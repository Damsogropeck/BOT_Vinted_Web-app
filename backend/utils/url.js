import {HttpError} from './errors.js';

const TRACKING_PARAM_PATTERNS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^ref$/i, /^referrer$/i, /^source$/i, /^tracking/i];
const DISALLOWED_SEARCH_PARAMS = new Set(['page']);

function isVintedHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  return /^([a-z0-9-]+\.)*vinted\.[a-z]{2,}$/i.test(host);
}

function normalizePathname(pathname) {
  const compact = pathname.replace(/\/+/g, '/').trim();
  if (!compact || compact === '/') {
    return '/';
  }

  return compact.endsWith('/') ? compact.slice(0, -1) : compact;
}

function shouldKeepParam(key, forItemUrl = false) {
  const normalized = String(key ?? '').toLowerCase();

  if (TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  if (forItemUrl) {
    return false;
  }

  return !DISALLOWED_SEARCH_PARAMS.has(normalized);
}

function normalizeParams(searchParams, forItemUrl = false) {
  const uniquePairs = new Set();
  const result = [];

  for (const [key, value] of searchParams.entries()) {
    if (!shouldKeepParam(key, forItemUrl)) {
      continue;
    }

    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (!normalizedKey || !normalizedValue) {
      continue;
    }

    const uniqueKey = `${normalizedKey}\u0000${normalizedValue}`;
    if (uniquePairs.has(uniqueKey)) {
      continue;
    }

    uniquePairs.add(uniqueKey);
    result.push([normalizedKey, normalizedValue]);
  }

  result.sort(([aKey, aValue], [bKey, bValue]) => {
    const keyCompare = aKey.localeCompare(bKey);
    if (keyCompare !== 0) {
      return keyCompare;
    }

    return aValue.localeCompare(bValue);
  });

  return result;
}

function normalizeUrlObject(urlObject, options = {}) {
  const normalized = new URL(urlObject.toString());
  normalized.protocol = 'https:';
  normalized.hostname = normalized.hostname.toLowerCase();
  normalized.hash = '';
  normalized.pathname = normalizePathname(normalized.pathname);

  if (normalized.port === '80' || normalized.port === '443') {
    normalized.port = '';
  }

  const pairs = normalizeParams(normalized.searchParams, Boolean(options.forItemUrl));
  normalized.search = '';
  for (const [key, value] of pairs) {
    normalized.searchParams.append(key, value);
  }

  if (!options.forItemUrl) {
    // Force newest-first ordering for bot monitoring consistency.
    normalized.searchParams.delete('order');
    normalized.searchParams.append('order', 'newest_first');
  }

  return normalized;
}

export function normalizeVintedUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    try {
      parsed = new URL(`https://${String(rawUrl ?? '').trim()}`);
    } catch {
      throw new HttpError(400, 'URL invalide');
    }
  }

  if (!isVintedHost(parsed.hostname)) {
    throw new HttpError(400, "L'URL doit pointer vers un domaine Vinted");
  }

  return normalizeUrlObject(parsed, {forItemUrl: false}).toString();
}

export function ensureAbsoluteUrl(rawUrl, baseUrl) {
  if (!rawUrl) {
    return '';
  }

  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return '';
  }
}

export function normalizeItemUrl(rawUrl, baseUrl) {
  const absolute = ensureAbsoluteUrl(rawUrl, baseUrl);
  if (!absolute) {
    return '';
  }

  try {
    const parsed = new URL(absolute);
    return normalizeUrlObject(parsed, {forItemUrl: true}).toString();
  } catch {
    return '';
  }
}

export function extractItemIdFromUrl(rawUrl) {
  if (!rawUrl) {
    return '';
  }

  try {
    const parsed = new URL(rawUrl);
    const pathMatch = parsed.pathname.match(/\/items\/(\d+)/i);
    if (pathMatch) {
      return pathMatch[1];
    }

    const queryItemId = parsed.searchParams.get('item_id') ?? parsed.searchParams.get('id');
    if (queryItemId && /^\d+$/.test(queryItemId)) {
      return queryItemId;
    }
  } catch {
    const match = String(rawUrl).match(/\/items\/(\d+)/i);
    if (match) {
      return match[1];
    }
  }

  return '';
}
