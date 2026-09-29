import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { FeedbackResponse } from "../../shared/app-types.js";
import { openDb } from "../src/db.js";
import { createHarness, MAC } from "./helpers.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

describe("ご意見・問い合わせ", () => {
  it("送るとDBに残り、その日の残り回数が返る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);

    const res = await alice.post("/v1/feedback", { message: "QRが読み取れませんでした" });
    expect(res.status).toBe(201);
    expect((await h.json<FeedbackResponse>(res)).remaining).toBe(4);

    const row = h.repo.dump().find((table) => table.name === "feedback");
    // 誰でも見られる説明用のダンプには出さない（本文が出てしまうため）
    expect(row).toBeUndefined();
  });

  it("短すぎ・長すぎは断り、1日5件で打ち止め", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);

    expect((await alice.post("/v1/feedback", { message: "あ" })).status).toBe(400);
    expect((await alice.post("/v1/feedback", { message: "あ".repeat(1001) })).status).toBe(400);

    for (let i = 0; i < 5; i++) {
      expect((await alice.post("/v1/feedback", { message: `${i} 回目のご意見` })).status).toBe(201);
    }
    const over = await alice.post("/v1/feedback", { message: "6回目のご意見" });
    expect(over.status).toBe(429);
  });

  it("ログインしていないと送れない", async () => {
    const h = createHarness();
    expect((await h.call("/v1/feedback", { method: "POST", body: JSON.stringify({ message: "こんにちは" }) })).status).toBe(401);
  });
});

describe("DBの引き上げ", () => {
  it("v2のDBを開くと、足りない列と表を入れて最新（v4）にする", () => {
    const dir = mkdtempSync(join(tmpdir(), "cokoyo-v2-"));
    const path = join(dir, "v2.db");
    try {
      // v2 のときの形（必要なところだけ）
      const old = new DatabaseSync(path);
      old.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL UNIQUE);
        PRAGMA user_version = 2;
      `);
      old.close();

      const db = openDb(path);
      expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 4 });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'feedback'").get()).toBeTruthy();
      // 「知り合いかも」に出すかどうかの列（既定は出す）
      const columns = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((r) => r.name);
      expect(columns).toContain("discoverable");
      db.close();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
