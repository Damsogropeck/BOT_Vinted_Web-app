import {db} from './database.js';
import {createItemDedupKey} from '../utils/itemKey.js';

function mapItemRow(row) {
  if (!row) {
    return null;
  }

  return {
    itemId: row.item_id,
    searchId: row.search_id,
    searchLabel: row.search_label,
    title: row.title,
    price: row.price,
    brand: row.brand,
    size: row.size,
    condition: row.condition,
    imageUrl: row.image_url,
    itemUrl: row.item_url,
    detectedAt: row.detected_at,
  };
}

const markSeenStmt = db.prepare(`
INSERT OR IGNORE INTO seen_items (
  search_id,
  item_key,
  first_seen_at
) VALUES (
  @searchId,
  @itemKey,
  @firstSeenAt
)
`);

const insertItemStmt = db.prepare(`
INSERT INTO items (
  item_id,
  search_id,
  title,
  price,
  brand,
  size,
  condition,
  image_url,
  item_url,
  detected_at
) VALUES (
  @itemId,
  @searchId,
  @title,
  @price,
  @brand,
  @size,
  @condition,
  @imageUrl,
  @itemUrl,
  @detectedAt
)
`);

const enrichExistingItemStmt = db.prepare(`
UPDATE items
SET
  title = CASE
    WHEN (@title IS NOT NULL AND @title <> '' AND (
      title IS NULL OR title = '' OR title = 'Article Vinted' OR instr(lower(title), 'marque:') > 0
    )) THEN @title
    ELSE title
  END,
  price = CASE
    WHEN (price IS NULL OR price = '') AND @price IS NOT NULL AND @price <> '' THEN @price
    ELSE price
  END,
  brand = CASE
    WHEN (brand IS NULL OR brand = '') AND @brand IS NOT NULL AND @brand <> '' THEN @brand
    ELSE brand
  END,
  size = CASE
    WHEN (size IS NULL OR size = '') AND @size IS NOT NULL AND @size <> '' THEN @size
    ELSE size
  END,
  condition = CASE
    WHEN (condition IS NULL OR condition = '') AND @condition IS NOT NULL AND @condition <> '' THEN @condition
    ELSE condition
  END,
  image_url = CASE
    WHEN (image_url IS NULL OR image_url = '') AND @imageUrl IS NOT NULL AND @imageUrl <> '' THEN @imageUrl
    ELSE image_url
  END,
  item_url = CASE
    WHEN (item_url IS NULL OR item_url = '') AND @itemUrl IS NOT NULL AND @itemUrl <> '' THEN @itemUrl
    ELSE item_url
  END
WHERE search_id = @searchId AND item_id = @itemId
`);

const insertManyTx = db.transaction((searchId, items, detectedAt) => {
  let inserted = 0;

  for (const item of items) {
    const {itemKey, normalizedItemUrl, canonicalItemId} = createItemDedupKey(item);

    const seenResult = markSeenStmt.run({
      searchId,
      itemKey,
      firstSeenAt: detectedAt,
    });

    if (seenResult.changes === 0) {
      enrichExistingItemStmt.run({
        searchId,
        itemId: canonicalItemId,
        title: item.title ?? '',
        price: item.price ?? '',
        brand: item.brand ?? '',
        size: item.size ?? '',
        condition: item.condition ?? '',
        imageUrl: item.imageUrl ?? '',
        itemUrl: normalizedItemUrl || item.itemUrl || '',
      });
      continue;
    }

    insertItemStmt.run({
      itemId: canonicalItemId,
      searchId,
      title: item.title ?? 'Article Vinted',
      price: item.price ?? '',
      brand: item.brand ?? '',
      size: item.size ?? '',
      condition: item.condition ?? '',
      imageUrl: item.imageUrl ?? '',
      itemUrl: normalizedItemUrl || item.itemUrl,
      detectedAt,
    });

    inserted += 1;
  }

  return inserted;
});

const markSeenOnlyTx = db.transaction((searchId, items, firstSeenAt) => {
  let marked = 0;

  for (const item of items) {
    const {itemKey} = createItemDedupKey(item);
    const seenResult = markSeenStmt.run({
      searchId,
      itemKey,
      firstSeenAt,
    });

    if (seenResult.changes > 0) {
      marked += 1;
    }
  }

  return marked;
});

const listRecentStmt = db.prepare(`
SELECT
  i.item_id,
  i.search_id,
  i.title,
  i.price,
  i.brand,
  i.size,
  i.condition,
  i.image_url,
  i.item_url,
  i.detected_at,
  s.label AS search_label
FROM items i
LEFT JOIN searches s ON s.id = i.search_id
ORDER BY datetime(i.detected_at) DESC, i.id ASC
LIMIT ?
`);

const countStmt = db.prepare('SELECT COUNT(*) AS total FROM items');

export const itemRepository = {
  insertNewItems(searchId, items, detectedAt) {
    if (!items.length) {
      return 0;
    }

    return insertManyTx(searchId, items, detectedAt);
  },

  markItemsAsSeen(searchId, items, firstSeenAt) {
    if (!items.length) {
      return 0;
    }

    return markSeenOnlyTx(searchId, items, firstSeenAt);
  },

  listRecent(limit = 30) {
    return listRecentStmt.all(limit).map(mapItemRow);
  },

  countAll() {
    return countStmt.get().total;
  },
};
