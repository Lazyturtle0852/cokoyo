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

-- key が事実上 person。ログイン画面もアカウント登録もない。
CREATE TABLE IF NOT EXISTS persons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  share_key    TEXT NOT NULL UNIQUE,   -- 配る
  secret_hash  TEXT NOT NULL UNIQUE,   -- 配らない値のsha256。平文は保存しない
  mac          TEXT NOT NULL UNIQUE,   -- 小文字16進12桁・区切りなし
  created_at   TEXT NOT NULL
);

-- (A,B) と (B,A) は id の大小で正規化して1行に畳む。
CREATE TABLE IF NOT EXISTS connections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  person_low   INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  person_high  INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL DEFAULT 'campus',  -- 'campus' | 'building' 無向
  blocked      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  UNIQUE(person_low, person_high),
  CHECK (person_low < person_high),
  CHECK (scope IN ('campus', 'building'))
);

CREATE INDEX IF NOT EXISTS idx_connections_low  ON connections(person_low);
CREATE INDEX IF NOT EXISTS idx_connections_high ON connections(person_high);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Sqlite(path);
  db.exec(SCHEMA);
  return db;
}
