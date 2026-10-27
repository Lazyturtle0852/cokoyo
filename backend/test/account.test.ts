import { describe, expect, it } from "vitest";
import type { FriendsResponse, GreetingsResponse } from "../../shared/app-types.js";
import { newSecret } from "../src/auth.js";
import { createHarness, MAC, present } from "./helpers.js";

/** 利用者を指す列。退会したあと、どのテーブルのこの列にも残っていてはいけない */
const USER_REF_COLUMNS = new Set([
  "id", "user_id", "user_low", "user_high", "requested_by", "from_id", "to_id",
  "blocker_id", "blocked_id", "other_user_id",
]);

describe("退会", () => {
  it("本人の行と、本人を指す行がすべて消える。相手は残る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    const aliceId = h.repo.findByUserId(alice.userId)!.id;
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    h.dtc.set(MAC.alice, present("kappa"));
    h.dtc.set(MAC.bob, present("kappa"));
    await alice.post("/v1/checks");
    await bob.post("/v1/checks");
    await alice.post(`/v1/friends/${bob.userId}/greet`);
    await alice.post("/v1/push/subscriptions", {
      endpoint: "https://web.push.apple.com/QGx",
      keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
    });

    const res = await alice.del("/v1/me");
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/cokoyo_session=;/);

    expect((await alice.get("/v1/me")).status).toBe(401);
    expect(h.repo.findByUserId(alice.userId)).toBeUndefined();
    expect(h.repo.findByMac(MAC.alice)).toBeUndefined();
    expect((await h.json<FriendsResponse>(await bob.get("/v1/friends"))).friends).toEqual([]);
    expect((await h.json<GreetingsResponse>(await bob.get("/v1/greetings"))).greetings).toEqual([]);
    expect((await bob.get("/v1/me")).status).toBe(200);
    const bobPoints = h.repo.dump(true).find((t) => t.name === "point_events")!;
    const labels = bobPoints.rows.map((r) => String(r[bobPoints.columns.indexOf("label")]));
    expect(labels).toContain("退会した人とはじめてマッチ");
    expect(labels.join()).not.toContain("ゆうき");

    for (const table of h.repo.dump(true)) {
      const cols = table.columns.map((c, i) => [c, i] as const).filter(([c]) => USER_REF_COLUMNS.has(c));
      for (const row of table.rows) {
        for (const [col, i] of cols) expect(row[i], `${table.name}.${col}`).not.toBe(aliceId);
      }
    }
  });

  it("初回登録の途中でも退会できる", async () => {
    const h = createHarness();
    const pending = h.repo.findOrCreateGoogleUser(newSecret(), "pending@keio.jp");
    const token = newSecret();
    h.repo.createSession(pending.id, token);
    expect((await h.call("/v1/me", { method: "DELETE", token })).status).toBe(204);
    expect(h.repo.findByEmail("pending@keio.jp")).toBeUndefined();
  });

  it("ログインしていなければ断る", async () => {
    const h = createHarness();
    expect((await h.call("/v1/me", { method: "DELETE" })).status).toBe(401);
  });
});
