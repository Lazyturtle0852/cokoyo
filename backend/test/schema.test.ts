import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

describe("DB切替", () => {
  it("旧 users テーブルがあるDBをv2として開かない", () => {
    const dir = mkdtempSync(join(tmpdir(), "cokoyo-v1-"));
    const path = join(dir, "old.db");
    try {
      const old = new DatabaseSync(path);
      old.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, mac TEXT NOT NULL)");
      old.close();
      expect(() => openDb(path)).toThrow("Unsupported database schema");
      const stillOld = new DatabaseSync(path);
      expect(stillOld.prepare("SELECT name FROM sqlite_master WHERE name = 'users'").get()).toBeTruthy();
      expect(stillOld.prepare("PRAGMA user_version").get()).toEqual({ user_version: 0 });
      stillOld.close();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
