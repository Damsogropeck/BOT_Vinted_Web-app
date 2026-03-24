import {db} from './database.js';
import {nowIso} from '../utils/time.js';

function mapSearchRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    label: row.label,
    isActive: Boolean(row.is_active),
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCheckAt: row.last_check_at,
  };
}

const baseSelect = `
SELECT id, url, normalized_url, label, is_active, is_pinned, created_at, updated_at, last_check_at
FROM searches
`;

const selectByIdStmt = db.prepare(`${baseSelect} WHERE id = ? LIMIT 1`);
const listStmt = db.prepare(`${baseSelect} ORDER BY is_pinned DESC, created_at DESC`);
const listActiveStmt = db.prepare(`${baseSelect} WHERE is_active = 1 ORDER BY is_pinned DESC, created_at DESC`);
const countActiveStmt = db.prepare('SELECT COUNT(*) AS total FROM searches WHERE is_active = 1');
const countAllStmt = db.prepare('SELECT COUNT(*) AS total FROM searches');
const deleteStmt = db.prepare('DELETE FROM searches WHERE id = ?');
const updateLastCheckStmt = db.prepare('UPDATE searches SET last_check_at = ?, updated_at = ? WHERE id = ?');

export const searchRepository = {
  list() {
    return listStmt.all().map(mapSearchRow);
  },

  listActive() {
    return listActiveStmt.all().map(mapSearchRow);
  },

  getById(id) {
    return mapSearchRow(selectByIdStmt.get(id));
  },

  create({url, normalizedUrl, label, isActive = true, isPinned = false}) {
    const now = nowIso();
    const result = db
      .prepare(
        `INSERT INTO searches (url, normalized_url, label, is_active, is_pinned, created_at, updated_at)
         VALUES (@url, @normalizedUrl, @label, @isActive, @isPinned, @createdAt, @updatedAt)`,
      )
      .run({
        url,
        normalizedUrl,
        label,
        isActive: isActive ? 1 : 0,
        isPinned: isPinned ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });

    return this.getById(result.lastInsertRowid);
  },

  update(id, patch) {
    const setParts = [];
    const params = {id, updatedAt: nowIso()};

    if (Object.hasOwn(patch, 'url')) {
      setParts.push('url = @url');
      params.url = patch.url;
    }
    if (Object.hasOwn(patch, 'normalizedUrl')) {
      setParts.push('normalized_url = @normalizedUrl');
      params.normalizedUrl = patch.normalizedUrl;
    }
    if (Object.hasOwn(patch, 'label')) {
      setParts.push('label = @label');
      params.label = patch.label;
    }
    if (Object.hasOwn(patch, 'isActive')) {
      setParts.push('is_active = @isActive');
      params.isActive = patch.isActive ? 1 : 0;
    }
    if (Object.hasOwn(patch, 'isPinned')) {
      setParts.push('is_pinned = @isPinned');
      params.isPinned = patch.isPinned ? 1 : 0;
    }
    if (Object.hasOwn(patch, 'lastCheckAt')) {
      setParts.push('last_check_at = @lastCheckAt');
      params.lastCheckAt = patch.lastCheckAt;
    }

    if (!setParts.length) {
      return this.getById(id);
    }

    setParts.push('updated_at = @updatedAt');

    db.prepare(`UPDATE searches SET ${setParts.join(', ')} WHERE id = @id`).run(params);
    return this.getById(id);
  },

  touchLastCheckAt(id, isoDate) {
    const stamp = isoDate ?? nowIso();
    updateLastCheckStmt.run(stamp, stamp, id);
  },

  delete(id) {
    return deleteStmt.run(id).changes > 0;
  },

  countActive() {
    return countActiveStmt.get().total;
  },

  countAll() {
    return countAllStmt.get().total;
  },
};
