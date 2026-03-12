import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {config} from '../config.js';

const dbDirectory = path.dirname(config.dbPath);
if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, {recursive: true});
}

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_check_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  search_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  price TEXT,
  brand TEXT,
  size TEXT,
  condition TEXT,
  image_url TEXT,
  item_url TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  UNIQUE(item_id, search_id),
  FOREIGN KEY(search_id) REFERENCES searches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seen_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  UNIQUE(search_id, item_key),
  FOREIGN KEY(search_id) REFERENCES searches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_detected_at ON items(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_search_id ON items(search_id);
CREATE INDEX IF NOT EXISTS idx_seen_items_search_id ON seen_items(search_id);
`);

db.exec(`
INSERT OR IGNORE INTO seen_items (search_id, item_key, first_seen_at)
SELECT
  search_id,
  CASE
    WHEN item_id IS NOT NULL AND item_id <> '' THEN 'id:' || lower(item_id)
    ELSE 'url:' || lower(item_url)
  END AS item_key,
  detected_at
FROM items
`);
