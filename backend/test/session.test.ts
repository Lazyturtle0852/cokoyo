import { describe, expect, it } from "vitest";
import { createHarness, MAC } from "./helpers.js";

describe("ログイン状態", () => {
  it("使うと期限が60日先まで延び、Cookie も延ばし直す。同じ日のうちは何度使っても書き直さない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const db = h.repo.database();
    // 前の作り（14日）でログインして、残り3日になった人
    db.prepare("UPDATE sessions SET expires_at = ?").run(new Date(Date.now() + 3 * 86400000).toISOString());

    const first = await alice.get("/v1/me");
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toMatch(/Max-Age=5184000/);
    const { expires_at } = db.prepare("SELECT expires_at FROM sessions").get() as { expires_at: string };
    expect(Date.parse(expires_at) - Date.now()).toBeGreaterThan(59 * 86400000);

    const again = await alice.get("/v1/me");
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  it("期限が切れたログイン状態は延ばさない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    h.repo.database().prepare("UPDATE sessions SET expires_at = ?").run(new Date(Date.now() - 1000).toISOString());
    expect((await alice.get("/v1/me")).status).toBe(401);
  });
});
