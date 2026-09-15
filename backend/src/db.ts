import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";

/**
 * node:sqlite は Node 24 標準（ネイティブビルド不要）。
 * ただし Vite / Vitest が同梱する組み込みモジュール一覧がまだこれを知らず、
 * 静的 import だと解決に失敗する。値は require で取り、型だけ import する。
 */
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: Sqlite } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

export type Db = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ログインは無い。登録時に発行する端末トークンが本人の証明。
CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            TEXT NOT NULL UNIQUE,  -- u_xxxx 外向けのID
  display_name       TEXT NOT NULL,
  share_key          TEXT NOT NULL UNIQUE,  -- sk_xxxx 配ってよい値
  device_token_hash  TEXT NOT NULL UNIQUE,  -- dt_xxxx の sha256。平文は保存しない
  mac                TEXT NOT NULL UNIQUE,  -- 小文字16進12桁・区切りなし
  hidden             INTEGER NOT NULL DEFAULT 0,
  mac_registered_at  TEXT NOT NULL,
  created_at         TEXT NOT NULL
);

-- (A,B) と (B,A) は id の大小で正規化して1行に畳む。
-- best は片側ずつのフラグで持ち、両方立っていれば成立とみなす。
CREATE TABLE IF NOT EXISTS friendships (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_low      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL,           -- 'pending' | 'friends'
  requested_by  INTEGER,                    -- pending のとき申請した側
  request_id    TEXT UNIQUE,                -- fr_xxxx
  best_low      INTEGER NOT NULL DEFAULT 0,
  best_high     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  friends_since TEXT,
  UNIQUE(user_low, user_high),
  CHECK (user_low < user_high),
  CHECK (status IN ('pending', 'friends'))
);

-- ブロックは一方向。フレンド関係そのものは消さない。
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- 入ったポイント1件。今日の分と累計はここから数える。
CREATE TABLE IF NOT EXISTS point_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,              -- JST の YYYY-MM-DD
  kind          TEXT NOT NULL,
  label         TEXT NOT NULL,
  pts           INTEGER NOT NULL,
  other_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  days          INTEGER,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_points_user_date ON point_events(user_id, date);

-- base が入った日 = 来校日。streak の判定に使う。
CREATE TABLE IF NOT EXISTS visits (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

-- 最後にマッチした日。reunion と first の判定に使う。一方向。
CREATE TABLE IF NOT EXISTS matches (
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_date     TEXT NOT NULL,
  PRIMARY KEY (user_id, other_user_id)
);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Sqlite(path);
  db.exec(SCHEMA);
  return db;
}
