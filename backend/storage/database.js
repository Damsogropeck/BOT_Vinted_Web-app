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
db.pragma('cache_size = -4000');        // Limite le cache SQLite à ~4 MB
db.pragma('wal_autocheckpoint = 100');  // Checkpoint WAL toutes les 100 pages (défaut : 1000)

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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscription_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  search_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(subscription_id, search_id),
  FOREIGN KEY(subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY(search_id) REFERENCES searches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_detected_at ON items(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_search_id ON items(search_id);
CREATE INDEX IF NOT EXISTS idx_seen_items_search_id ON seen_items(search_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at ON push_subscriptions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscription_searches_search_id ON push_subscription_searches(search_id);
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
