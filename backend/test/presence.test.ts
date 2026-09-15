import { describe, expect, it } from "vitest";
import type { PresenceResponse } from "../../shared/api-types.js";
import { createHarness } from "./helpers.js";

const ALICE = "a2b41c9e7703";
const BOB = "6e0d33b1c840";
const CAROL = "55e0a1b7cc94";

async function presence(
  call: ReturnType<typeof createHarness>["call"],
  secret: string,
  keys: string[],
): Promise<PresenceResponse> {
  const res = await call("/presence", {
    method: "POST",
    secret,
    body: JSON.stringify({ share_keys: keys }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as PresenceResponse;
}

describe("POST /presence", () => {
  it("つながっている相手の在校が見える", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);
    const bob = await h.register(BOB);
    h.dtc.set(BOB, { status: "present", buildingKey: "iota" });

    await h.call("/connections", {
      method: "POST",
      secret: alice.secret,
      body: JSON.stringify({ share_key: bob.share_key }),
    });

    const body = await presence(h.call, alice.secret, [bob.share_key]);
    expect(body.results[0]).toEqual({ share_key: bob.share_key, present: true });
  });

  it("scope が building のときだけ建物が返る", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);
    const bob = await h.register(BOB);
    h.dtc.set(BOB, { status: "present", buildingKey: "tau" });

    await h.call("/connections", {
      method: "POST",
      secret: alice.secret,
      body: JSON.stringify({ share_key: bob.share_key }),
    });

    const beforeChange = await presence(h.call, alice.secret, [bob.share_key]);
    expect(beforeChange.results[0]?.building).toBeUndefined();

    await h.call(`/connections/${bob.share_key}`, {
      method: "PATCH",
      secret: alice.secret,
      body: JSON.stringify({ scope: "building" }),
    });

    const afterChange = await presence(h.call, alice.secret, [bob.share_key]);
    expect(afterChange.results[0]?.building).toBe("tau");
  });

  it("scope は無向。片方が変えると両方に効く", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);
    const bob = await h.register(BOB);
    h.dtc.set(ALICE, { status: "present", buildingKey: "omega" });

    await h.call("/connections", {
      method: "POST",
      secret: alice.secret,
      body: JSON.stringify({ share_key: bob.share_key }),
    });
    // alice 側から building に変更する
    await h.call(`/connections/${bob.share_key}`, {
      method: "PATCH",
      secret: alice.secret,
      body: JSON.stringify({ scope: "building" }),
    });

    // bob から alice を見ても building が見える
    const body = await presence(h.call, bob.secret, [alice.share_key]);
    expect(body.results[0]?.building).toBe("omega");
  });

  it("自分自身は常に見える", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);
    h.dtc.set(ALICE, { status: "present", buildingKey: "delta" });

    const body = await presence(h.call, alice.secret, [alice.share_key]);
    expect(body.results[0]).toEqual({
      share_key: alice.share_key,
      present: true,
      building: "delta",
    });
  });

  it("as_of は5分に丸められる", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);
    const body = await presence(h.call, alice.secret, []);
    const minutes = new Date(body.as_of).getUTCMinutes();
    const seconds = new Date(body.as_of).getUTCSeconds();
    expect(minutes % 5).toBe(0);
    expect(seconds).toBe(0);
  });
});

describe("false は1種類だけ（仕様06）", () => {
  it("いない・ブロック・未接続・存在しないkey が区別できない", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);
    const bob = await h.register(BOB);
    const carol = await h.register(CAROL);

    // bob: つながっているがブロック。建物にはいる
    await h.call("/connections", {
      method: "POST",
      secret: alice.secret,
      body: JSON.stringify({ share_key: bob.share_key }),
    });
    await h.call(`/connections/${bob.share_key}`, {
      method: "PATCH",
      secret: alice.secret,
      body: JSON.stringify({ blocked: true, scope: "building" }),
    });
    h.dtc.set(BOB, { status: "present", buildingKey: "iota" });

    // carol: 実在するがつながっていない。建物にはいる
    h.dtc.set(CAROL, { status: "present", buildingKey: "iota" });

    const body = await presence(h.call, alice.secret, [
      bob.share_key,
      carol.share_key,
      "k_this_key_does_not_exist",
    ]);

    for (const result of body.results) {
      expect(result.present).toBe(false);
      expect(result.building).toBeUndefined();
      expect(Object.keys(result).sort()).toEqual(["present", "share_key"]);
    }

    // ブロック・未接続の相手には DTC を問い合わせない（MACが外に出ない）
    expect(h.dtc.asked).toEqual([]);
  });
});

describe("DTC が答えられなかったとき", () => {
  it("present:false に倒しつつ degraded を立てる（どの相手かは示さない）", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);
    const bob = await h.register(BOB);
    const carol = await h.register(CAROL);

    for (const friend of [bob, carol]) {
      await h.call("/connections", {
        method: "POST",
        secret: alice.secret,
        body: JSON.stringify({ share_key: friend.share_key }),
      });
    }
    h.dtc.set(BOB, { status: "unavailable" });
    h.dtc.set(CAROL, { status: "present", buildingKey: "mu" });

    const body = await presence(h.call, alice.secret, [bob.share_key, carol.share_key]);

    expect(body.degraded).toBe(true);
    // 答えられなかった相手も、いない相手と同じ形で返る
    expect(body.results[0]).toEqual({ share_key: bob.share_key, present: false });
    expect(body.results[1]?.present).toBe(true);
  });

  it("全員answerできたときは degraded を付けない", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);
    const body = await presence(h.call, alice.secret, []);
    expect(body.degraded).toBeUndefined();
  });
});

describe("認証", () => {
  it("secret が無い・不正だと 401", async () => {
    const h = createHarness();
    await h.register(ALICE);

    const noToken = await h.call("/presence", {
      method: "POST",
      body: JSON.stringify({ share_keys: [] }),
    });
    expect(noToken.status).toBe(401);

    const badToken = await h.call("/presence", {
      method: "POST",
      secret: "s_not_a_real_secret",
      body: JSON.stringify({ share_keys: [] }),
    });
    expect(badToken.status).toBe(401);
  });

  it("share_key では認証できない（配る値と認証する値の分離）", async () => {
    const h = createHarness();
    const alice = await h.register(ALICE);

    const res = await h.call("/me", { secret: alice.share_key });
    expect(res.status).toBe(401);
  });
});
