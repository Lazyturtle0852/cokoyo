import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: Sqlite } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

export type Db = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar TEXT,
  share_key TEXT UNIQUE,
  hidden INTEGER NOT NULL DEFAULT 0,
  onboarding_completed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE mac_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mac TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  registered_at TEXT NOT NULL
);
CREATE INDEX idx_macs_user ON mac_addresses(user_id);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE auth_flows (
  state_hash TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_low INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'friends')),
  requested_by INTEGER,
  request_id TEXT UNIQUE,
  best_low INTEGER NOT NULL DEFAULT 0,
  best_high INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  friends_since TEXT,
  UNIQUE(user_low, user_high),
  CHECK (user_low < user_high)
);
CREATE TABLE blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE point_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  pts INTEGER NOT NULL,
  other_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  days INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_points_user_date ON point_events(user_id, date);
CREATE UNIQUE INDEX idx_points_daily_base ON point_events(user_id, date, kind)
  WHERE kind IN ('base', 'streak', 'rain');
CREATE UNIQUE INDEX idx_points_daily_match ON point_events(user_id, date, other_user_id)
  WHERE kind IN ('match', 'reunion', 'first');
CREATE TABLE visits (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE reactions (
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE TABLE matches (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_date TEXT NOT NULL,
  PRIMARY KEY (user_id, other_user_id)
);
PRAGMA user_version = 2;
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Sqlite(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (version === 2) return db;
  if (version !== 0 || db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get()) {
    db.close();
    throw new Error("Unsupported database schema; use a fresh v2 volume");
  }
  db.exec(SCHEMA);
  return db;
}
