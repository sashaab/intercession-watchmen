import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('watcher','leader','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS impressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchman_id INTEGER NOT NULL,
  watchman_name TEXT NOT NULL,
  perceived TEXT NOT NULL,
  interpretation TEXT,
  type TEXT NOT NULL,
  context TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'none',
  prayed INTEGER NOT NULL DEFAULT 0,
  confidential INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  decision_notes TEXT,
  outcome TEXT,
  forwarded_to TEXT,
  topic_cluster TEXT,
  ai_recommendation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (watchman_id) REFERENCES users(telegram_id)
);

CREATE TABLE IF NOT EXISTS prayer_focuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed')),
  duration_weeks INTEGER NOT NULL DEFAULT 4,
  leader_name TEXT,
  origin_note TEXT,
  shared_with TEXT,
  review_date TEXT,
  updates TEXT,
  reflection TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prayer_focus_impressions (
  prayer_focus_id INTEGER NOT NULL,
  impression_id INTEGER NOT NULL,
  PRIMARY KEY (prayer_focus_id, impression_id),
  FOREIGN KEY (prayer_focus_id) REFERENCES prayer_focuses(id),
  FOREIGN KEY (impression_id) REFERENCES impressions(id)
);

CREATE TABLE IF NOT EXISTS draft_impressions (
  telegram_id INTEGER PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_impressions_status ON impressions(status);
CREATE INDEX IF NOT EXISTS idx_impressions_watchman ON impressions(watchman_id);
CREATE INDEX IF NOT EXISTS idx_impressions_created ON impressions(created_at);
CREATE INDEX IF NOT EXISTS idx_impressions_cluster ON impressions(topic_cluster);
`;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(config.databasePath);
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
