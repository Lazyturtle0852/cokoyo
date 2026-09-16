import { describe, expect, it } from "vitest";
import type { DebugDbResponse } from "../../shared/app-types.js";
import { createHarness, MAC } from "./helpers.js";

const table = (dump: DebugDbResponse, name: string) => {
  const t = dump.tables.find((x) => x.name === name);
  if (!t) throw new Error(`${name} が無い`);
  return t;
};
/** 列名で引く。DBの生の行をそのまま返しているので、列の順に依存しない形で見る。 */
const col = (dump: DebugDbResponse, name: string, column: string) => {
  const t = table(dump, name);
  const i = t.columns.indexOf(column);
  return t.rows.map((r) => r[i]);
};

describe("/v1/debug/db", () => {
  it("登録していなくても見られる（説明用のページなので）", async () => {
    const h = createHarness();
    const res = await h.call("/v1/debug/db");
    expect(res.status).toBe(200);
    expect(table(await h.json<DebugDbResponse>(res), "users").rows).toHaveLength(0);
  });

  it("全員ぶんの行を、テーブルの形のまま返す", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await h.signUp("知らない人", MAC.carol); // 誰ともフレンドではない
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });

    const dump = await h.json<DebugDbResponse>(await h.call("/v1/debug/db"));

    // 関わりの無い人も含めて、users は丸ごと出る
    expect(col(dump, "users", "display_name")).toEqual(["ゆうき", "佐藤", "知らない人"]);
    expect(col(dump, "users", "share_key")).toContain(bob.shareKey);

    // friendships は (小さい方, 大きい方) に畳まれている
    expect(table(dump, "friendships").rows).toHaveLength(1);
    expect(Number(col(dump, "friendships", "user_low")[0]))
      .toBeLessThan(Number(col(dump, "friendships", "user_high")[0]));
    expect(col(dump, "friendships", "status")).toEqual(["friends"]);
  });

  it("MACは伏せ、端末トークンは頭だけにする", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);

    const dump = await h.json<DebugDbResponse>(await h.call("/v1/debug/db"));
    expect(col(dump, "users", "mac")).toEqual(["a2:b4:••:••:••:03"]);
    // MAC は事実上のパスワード（POST /v1/sessions がこれで通る）なので平文で出さない
    expect(JSON.stringify(dump)).not.toContain(MAC.alice);
    expect(JSON.stringify(dump)).not.toContain(alice.deviceToken);
    expect(String(col(dump, "users", "device_token_hash")[0])).toMatch(/^[0-9a-f]{12}…$/);
  });

  it("ブロックも、誰が誰をブロックしたかの形のまま出る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await bob.post(`/v1/friends/${alice.userId}/block`);

    const dump = await h.json<DebugDbResponse>(await h.call("/v1/debug/db"));
    expect(table(dump, "blocks").rows).toHaveLength(1);
    expect(col(dump, "blocks", "blocker_id")).toEqual([2]);
    expect(col(dump, "blocks", "blocked_id")).toEqual([1]);
  });
});
