import {config} from '../config.js';
import {fetchText, HttpRequestError, sleepRandom} from '../utils/http.js';
import {createLogger} from '../utils/logger.js';
import {ensureAbsoluteUrl, extractItemIdFromUrl, normalizeItemUrl} from '../utils/url.js';

const logger = createLogger('scraper.vinted');

class ScraperError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ScraperError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.cause = options.cause;
    this.meta = options.meta ?? {};
  }
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const NAMED_HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeHtmlEntities(raw) {
  return String(raw ?? '').replace(
    /&#(\d+);|&#x([0-9a-f]+);|&([a-z#0-9]+);/gi,
    (match, dec, hex, name) => {
      if (dec) return String.fromCharCode(Number(dec));
      if (hex) return String.fromCharCode(Number.parseInt(hex, 16));
      return NAMED_HTML_ENTITIES[`&${name};`] ?? match;
    },
  );
}

function extractBalancedJson(source, startIndex) {
  const first = source[startIndex];
  if (first !== '{' && first !== '[') {
    return '';
  }

  const closer = first === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === first) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, i + 1);
      }
    }
  }

  return '';
}

function collectJsonCandidatesFromScripts(html) {
  const candidates = [];

  const scriptJsonRegex = /<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptJsonRegex)) {
    const parsed = safeJsonParse(match[1].trim());
    if (parsed) {
      candidates.push(parsed);
    }
  }

  const assignmentMarkers = [
    'window.__INITIAL_STATE__',
    'window.__PRELOADED_STATE__',
    '__NEXT_DATA__',
    'window.__NUXT__',
  ];

  for (const marker of assignmentMarkers) {
    let cursor = 0;

    while (cursor < html.length) {
      const markerIndex = html.indexOf(marker, cursor);
      if (markerIndex === -1) {
        break;
      }

      const equalIndex = html.indexOf('=', markerIndex);
      if (equalIndex === -1) {
        break;
      }

      const openCurly = html.indexOf('{', equalIndex);
      const openBracket = html.indexOf('[', equalIndex);
      const starts = [openCurly, openBracket].filter((index) => index !== -1);
      if (!starts.length) {
        cursor = markerIndex + marker.length;
        continue;
      }

      const startIndex = Math.min(...starts);
      const jsonRaw = extractBalancedJson(html, startIndex);
      if (!jsonRaw) {
        cursor = markerIndex + marker.length;
        continue;
      }

      const parsed = safeJsonParse(jsonRaw);
      if (parsed) {
        candidates.push(parsed);
      }

      cursor = startIndex + jsonRaw.length;
    }
  }

  return candidates;
}

function looksLikeItem(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return false;
  }

  const hasId = node.id != null || node.item_id != null || node.itemId != null;
  const hasUrl = typeof node.url === 'string' || typeof node.path === 'string' || typeof node.item_url === 'string';
  const hasTitle = typeof node.title === 'string' || typeof node.name === 'string';
  const hasPrice = node.price != null || node.total_item_price != null || node.price_numeric != null;

  return (hasId && (hasUrl || hasTitle || hasPrice)) || (hasUrl && hasTitle && hasPrice);
}

function collectRawItemsFromNode(node, bucket) {
  if (!node) {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      collectRawItemsFromNode(entry, bucket);
    }
    return;
  }

  if (typeof node !== 'object') {
    return;
  }

  if (node['@type'] === 'ListItem' && node.item) {
    bucket.push(node.item);
  }

  if (node['@type'] === 'Product') {
    bucket.push(node);
  }

  if (node.catalogItems && Array.isArray(node.catalogItems)) {
    bucket.push(...node.catalogItems);
  }

  if (looksLikeItem(node)) {
    bucket.push(node);
  }

  for (const value of Object.values(node)) {
    collectRawItemsFromNode(value, bucket);
  }
}

function readFirst(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const normalized = String(candidate).trim();
      if (normalized) {
        return normalized;
      }
      continue;
    }

    if (Array.isArray(candidate)) {
      const nested = readFirst(...candidate);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (typeof candidate === 'object') {
      const nested = readFirst(candidate.name, candidate.title, candidate.text, candidate.value, candidate.url);
      if (nested) {
        return nested;
      }
    }
  }
  return '';
}

function toPriceString(rawPrice) {
  if (rawPrice == null) {
    return '';
  }

  if (typeof rawPrice === 'string') {
    return rawPrice;
  }

  if (typeof rawPrice === 'number') {
    return `${rawPrice.toFixed(2).replace('.', ',')} €`;
  }

  if (typeof rawPrice === 'object') {
    const amount = rawPrice.amount ?? rawPrice.value;
    const currency = rawPrice.currency_code ?? rawPrice.currency ?? '€';
    if (amount != null) {
      const numeric = Number(amount);
      if (Number.isFinite(numeric)) {
        if (currency === 'EUR' || currency === '€') {
          return `${numeric.toFixed(2).replace('.', ',')} €`;
        }

        return `${numeric.toFixed(2)} ${currency}`;
      }

      return `${amount} ${currency}`.trim();
    }
  }

  return '';
}

function mapRawItem(raw, baseUrl) {
  const itemUrl = normalizeItemUrl(
    readFirst(raw.url, raw.item_url, raw.itemUrl, raw.path, raw.web_url, raw?.item?.url),
    baseUrl,
  );

  const itemId = readFirst(raw.id, raw.item_id, raw.itemId, extractItemIdFromUrl(itemUrl));
  if (!itemUrl) {
    return null;
  }

  const offersPrice = typeof raw.offers === 'object' ? raw.offers.price : '';

  return {
    itemId,
    title: readFirst(raw.title, raw.name, raw?.item?.title, raw?.item?.name) || 'Article Vinted',
    price:
      toPriceString(raw.price) ||
      toPriceString(raw.total_item_price) ||
      toPriceString(raw.price_numeric) ||
      toPriceString(offersPrice),
    brand: readFirst(raw.brand, raw.brand_title, raw?.item?.brand),
    size: readFirst(raw.size, raw.size_title, raw?.item?.size),
    condition: readFirst(raw.condition, raw.status, raw.status_title),
    imageUrl: ensureAbsoluteUrl(
      readFirst(
        raw.image_url,
        raw.image,
        raw?.photo?.url,
        raw?.photos?.[0]?.url,
        raw?.photos?.[0]?.full_size_url,
        raw?.image?.url,
      ),
      baseUrl,
    ),
    itemUrl,
  };
}

function extractFromRegex(content, regex) {
  const match = content.match(regex);
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeMetadataTitle(title) {
  return /(,\s*(?:marque|brand|état|etat|condition|taille|size)\s*:)/i.test(title);
}

function parseDescriptor(descriptor) {
  const normalized = normalizeWhitespace(descriptor);
  if (!normalized) {
    return {};
  }

  const title = normalizeWhitespace(
    normalized.split(/\s*,\s*(?:marque|brand|état|etat|condition|taille|size)\s*:/i)[0],
  );

  const brand = normalizeWhitespace(extractFromRegex(normalized, /(?:^|,)\s*(?:marque|brand)\s*:\s*([^,]+)/i));
  const condition = normalizeWhitespace(
    extractFromRegex(normalized, /(?:^|,)\s*(?:état|etat|condition)\s*:\s*([^,]+)/i),
  );
  const size = normalizeWhitespace(extractFromRegex(normalized, /(?:^|,)\s*(?:taille|size)\s*:\s*([^,]+)/i));

  return {
    title: title || '',
    brand: brand || '',
    condition: condition || '',
    size: size || '',
  };
}

function extractImageUrlFromChunk(chunk, baseUrl) {
  const candidates = [
    extractFromRegex(chunk, /<img[^>]+data-srcset=["']([^"']+)["']/i),
    extractFromRegex(chunk, /<img[^>]+srcset=["']([^"']+)["']/i),
    extractFromRegex(chunk, /<img[^>]+data-src=["']([^"']+)["']/i),
    extractFromRegex(chunk, /<img[^>]+src=["']([^"']+)["']/i),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const firstInSrcSet = candidate.split(',')[0]?.trim() ?? '';
    const firstToken = firstInSrcSet.split(/\s+/)[0]?.trim() ?? '';
    if (!firstToken || firstToken.startsWith('data:')) {
      continue;
    }

    const absolute = ensureAbsoluteUrl(firstToken, baseUrl);
    if (absolute) {
      return absolute;
    }
  }

  return '';
}

function parseDomItem(chunk, itemUrl) {
  const normalizedItemUrl = normalizeItemUrl(itemUrl);
  const itemId = extractItemIdFromUrl(normalizedItemUrl);

  if (!normalizedItemUrl) {
    return null;
  }

  const descriptor =
    extractFromRegex(chunk, /title=["']([^"']+)["']/i) ||
    extractFromRegex(chunk, /data-title=["']([^"']+)["']/i) ||
    extractFromRegex(chunk, /aria-label=["']([^"']+)["']/i) ||
    extractFromRegex(chunk, /alt=["']([^"']+)["']/i);

  const parsedDescriptor = parseDescriptor(descriptor);

  const title = parsedDescriptor.title || descriptor || 'Article Vinted';

  const price =
    extractFromRegex(chunk, /(\d{1,4}(?:[\s.,]\d{2})?\s?(?:€|EUR))/i) ||
    extractFromRegex(chunk, /price[^\d]*(\d{1,4}(?:[\s.,]\d{2})?\s?(?:€|EUR))/i) ||
    extractFromRegex(descriptor, /(\d{1,4}(?:[\s.,]\d{2})?\s?(?:€|EUR))/i);

  const brand =
    extractFromRegex(chunk, /(?:Marque|Brand)\s*:?\s*<[^>]*>([^<]{2,80})</i) ||
    extractFromRegex(chunk, /data-brand=["']([^"']+)["']/i) ||
    parsedDescriptor.brand;

  const size =
    extractFromRegex(chunk, /(?:Taille|Size)\s*:?\s*<[^>]*>([^<]{1,40})</i) ||
    extractFromRegex(chunk, /data-size=["']([^"']+)["']/i) ||
    parsedDescriptor.size;

  const condition =
    extractFromRegex(chunk, /(?:État|Etat|Condition)\s*:?\s*<[^>]*>([^<]{2,80})</i) ||
    extractFromRegex(chunk, /data-condition=["']([^"']+)["']/i) ||
    parsedDescriptor.condition;

  const imageUrl = extractImageUrlFromChunk(chunk, normalizedItemUrl);

  return {
    itemId,
    title,
    price,
    brand,
    size,
    condition,
    imageUrl,
    itemUrl: normalizedItemUrl,
  };
}

function pickBetterTitle(currentTitle, nextTitle) {
  const current = normalizeWhitespace(currentTitle);
  const next = normalizeWhitespace(nextTitle);

  if (!current || current === 'Article Vinted') {
    return next || current;
  }

  if (!next) {
    return current;
  }

  if (looksLikeMetadataTitle(current) && !looksLikeMetadataTitle(next)) {
    return next;
  }

  if (next.length < current.length && current.includes(next)) {
    return next;
  }

  return current;
}

function mergeItems(current, next) {
  return {
    itemId: current.itemId || next.itemId,
    title: pickBetterTitle(current.title, next.title),
    price: current.price || next.price,
    brand: current.brand || next.brand,
    size: current.size || next.size,
    condition: current.condition || next.condition,
    imageUrl: current.imageUrl || next.imageUrl,
    itemUrl: current.itemUrl || next.itemUrl,
  };
}

function dedupeItems(items) {
  const unique = [];
  const indexByKey = new Map();

  for (const item of items) {
    if (!item || !item.itemUrl) {
      continue;
    }

    const key = `${item.itemId || ''}|${normalizeItemUrl(item.itemUrl)}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex != null) {
      unique[existingIndex] = mergeItems(unique[existingIndex], item);
      continue;
    }

    indexByKey.set(key, unique.length);
    unique.push(item);
  }

  return unique;
}

function extractItemsFromDom(html, baseUrl) {
  const items = [];
  const anchorRegex = /<a[^>]+href=["']([^"']*\/items\/\d+[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = ensureAbsoluteUrl(decodeHtmlEntities(match[1]), baseUrl);
    const index = match.index ?? 0;
    const contextStart = Math.max(0, index - 1400);
    const contextEnd = Math.min(html.length, index + match[0].length + 1400);
    const chunk = html.slice(contextStart, contextEnd);
    const parsed = parseDomItem(chunk, href);

    if (parsed) {
      items.push(parsed);
    }
  }

  const directUrlRegex = /(https?:\/\/www\.vinted\.[^"'\s<>]+\/items\/\d+[^"'\s<>]*)/gi;
  for (const match of html.matchAll(directUrlRegex)) {
    const parsed = parseDomItem(match[0], decodeHtmlEntities(match[1]));
    if (parsed) {
      items.push(parsed);
    }
  }

  return dedupeItems(items);
}

function extractItemsFromHtml(html, baseUrl) {
  const warnings = [];

  try {
    const candidates = collectJsonCandidatesFromScripts(html);
    const rawItems = [];

    for (const candidate of candidates) {
      collectRawItemsFromNode(candidate, rawItems);
    }

    const mapped = dedupeItems(rawItems.map((item) => mapRawItem(item, baseUrl)));
    if (mapped.length > 0) {
      return {items: mapped, strategy: 'json', warnings};
    }

    warnings.push('No items extracted from embedded JSON');
  } catch (error) {
    warnings.push(`JSON extraction failed: ${error.message}`);
  }

  const domItems = extractItemsFromDom(html, baseUrl);
  if (domItems.length > 0) {
    return {items: domItems, strategy: 'dom', warnings};
  }

  return {items: [], strategy: 'none', warnings};
}

function extractMeta(html, key) {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    'i',
  );
  const match = html.match(regex);
  return match ? decodeHtmlEntities(match[1]) : '';
}

function createRequestBudget(maxRequests) {
  return {
    remaining: Math.max(1, maxRequests),
    consumed: 0,
  };
}

function consumeRequestBudget(budget, operation) {
  if (budget.remaining <= 0) {
    throw new ScraperError('REQUEST_LIMIT_REACHED', `Request budget exceeded during ${operation}`, {
      retryable: false,
      meta: {operation, consumed: budget.consumed},
    });
  }

  budget.remaining -= 1;
  budget.consumed += 1;
}

async function fetchWithBudget(url, budget, headers = {}) {
  consumeRequestBudget(budget, 'fetch');
  await sleepRandom(config.scraperMinDelayMs, config.scraperMaxDelayMs);

  try {
    return await fetchText(url, {
      headers,
      retries: config.httpRetries,
      timeoutMs: config.httpTimeoutMs,
      retryBaseDelayMs: config.httpRetryBaseDelayMs,
    });
  } catch (error) {
    if (error instanceof HttpRequestError) {
      throw new ScraperError('HTTP_FETCH_FAILED', error.message, {
        retryable: error.retryable,
        cause: error,
        meta: {status: error.status, url: error.url},
      });
    }

    throw new ScraperError('UNKNOWN_FETCH_FAILED', `Unexpected fetch error: ${error.message}`, {
      retryable: false,
      cause: error,
    });
  }
}

async function enrichItem(item, budget) {
  if (!item.itemUrl || budget.remaining <= 0) {
    return item;
  }

  try {
    const detailHtml = await fetchWithBudget(item.itemUrl, budget, {
      Referer: 'https://www.vinted.fr/',
    });

    return {
      ...item,
      title: item.title || extractMeta(detailHtml, 'og:title') || 'Article Vinted',
      price: item.price || extractMeta(detailHtml, 'product:price:amount'),
      imageUrl: item.imageUrl || extractMeta(detailHtml, 'og:image'),
    };
  } catch (error) {
    logger.warn('Detail enrichment failed', {
      itemUrl: item.itemUrl,
      error: error.message,
    });
    return item;
  }
}

export const vintedScraper = {
  async scrapeSearch(searchUrl, options = {}) {
    const maxItems = options.maxItems ?? config.maxItemsPerSearch;
    const enableDetailEnrichment = options.enableDetailEnrichment ?? config.enableDetailEnrichment;
    const maxDetailRequests = options.maxDetailRequests ?? config.maxDetailRequestsPerRun;
    const maxHttpRequests = options.maxHttpRequests ?? config.maxHttpRequestsPerSearch;

    const budget = createRequestBudget(maxHttpRequests);
    const startedAt = Date.now();

    try {
      const html = await fetchWithBudget(searchUrl, budget, {
        Referer: 'https://www.vinted.fr/',
      });

      const extraction = extractItemsFromHtml(html, searchUrl);
      let items = extraction.items.slice(0, maxItems);

      if (extraction.warnings.length > 0) {
        logger.warn('Extraction warnings', {
          searchUrl,
          warnings: extraction.warnings,
          strategy: extraction.strategy,
        });
      }

      if (enableDetailEnrichment && items.length > 0) {
        const enriched = [];
        let detailRequests = 0;

        for (const item of items) {
          const missingDetails = !item.title || !item.price || !item.imageUrl;
          if (missingDetails && detailRequests < maxDetailRequests && budget.remaining > 0) {
            detailRequests += 1;
            enriched.push(await enrichItem(item, budget));
          } else {
            enriched.push(item);
          }
        }

        items = enriched;
      }

      logger.info('Search scrape completed', {
        searchUrl,
        strategy: extraction.strategy,
        extracted: items.length,
        requestsConsumed: budget.consumed,
        elapsedMs: Date.now() - startedAt,
      });

      return items;
    } catch (error) {
      const wrapped =
        error instanceof ScraperError
          ? error
          : new ScraperError('SCRAPE_FAILED', error.message || 'Scrape failed', {
              retryable: false,
              cause: error,
            });

      logger.error('Search scrape failed', {
        searchUrl,
        code: wrapped.code,
        retryable: wrapped.retryable,
        error: wrapped.message,
      });

      throw wrapped;
    }
  },
};
