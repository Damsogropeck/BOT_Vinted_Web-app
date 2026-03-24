import crypto from 'node:crypto';
import {extractItemIdFromUrl, normalizeItemUrl} from './url.js';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

export function createItemDedupKey(item) {
  const normalizedItemUrl = normalizeItemUrl(item.itemUrl);
  const canonicalId = normalizeText(item.itemId || extractItemIdFromUrl(normalizedItemUrl));

  if (canonicalId) {
    return {
      itemKey: `id:${canonicalId}`,
      normalizedItemUrl,
      canonicalItemId: canonicalId,
    };
  }

  const signature = [
    normalizedItemUrl,
    normalizeText(item.title),
    normalizeText(item.price),
    normalizeText(item.brand),
  ].join('|');

  const fallback = hashText(signature || JSON.stringify(item));

  return {
    itemKey: `fp:${fallback}`,
    normalizedItemUrl,
    canonicalItemId: `fp-${fallback.slice(0, 12)}`,
  };
}
