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
  it("トークンが無ければ見せない", async () => {
    const h = createHarness();
    expect((await h.call("/v1/debug/db")).status).toBe(401);
  });

  it("自分の行はMACを伏せ、端末トークンは頭だけ出す", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const dump = await h.json<DebugDbResponse>(await alice.get("/v1/debug/db"));

    const users = table(dump, "users");
    expect(users.rows).toHaveLength(1);
    expect(col(dump, "users", "mac")).toEqual(["a2:b4:••:••:••:03"]);
    expect(JSON.stringify(dump)).not.toContain(MAC.alice);
    expect(JSON.stringify(dump)).not.toContain(alice.deviceToken);
    expect(String(col(dump, "users", "device_token_hash")[0])).toMatch(/^[0-9a-f]{12}…$/);
    // 自分の share_key は自分のものなので、そのまま出す
    expect(col(dump, "users", "share_key")).toEqual([alice.shareKey]);
  });

  it("関わりのある人は user_id と表示名だけ、無関係な人は出さない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await h.signUp("知らない人", MAC.carol); // フレンドでもブロックでもない
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });

    const dump = await h.json<DebugDbResponse>(await alice.get("/v1/debug/db"));
    expect(col(dump, "users", "display_name")).toEqual(["ゆうき", "佐藤"]);
    expect(JSON.stringify(dump)).not.toContain("知らない人");
    expect(JSON.stringify(dump)).not.toContain(MAC.bob);
    expect(JSON.stringify(dump)).not.toContain(bob.shareKey);

    // friendships は (小さい方, 大きい方) に畳まれている
    const f = table(dump, "friendships");
    expect(f.rows).toHaveLength(1);
    expect(Number(col(dump, "friendships", "user_low")[0]))
      .toBeLessThan(Number(col(dump, "friendships", "user_high")[0]));
    expect(col(dump, "friendships", "status")).toEqual(["friends"]);
  });

  it("自分をブロックしている相手は出さない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await bob.post(`/v1/friends/${alice.userId}/block`);

    const dump = await h.json<DebugDbResponse>(await alice.get("/v1/debug/db"));
    expect(table(dump, "blocks").rows).toHaveLength(0);
    expect(JSON.stringify(dump)).not.toContain("佐藤");
  });
});
