import { describe, expect, it } from "vitest";
import type { CheckResponse, Me } from "../../shared/app-types.js";
import { createHarness, MAC, present } from "./helpers.js";

const extra = ["aa0000000001", "aa0000000002", "aa0000000003", "aa0000000004", "aa0000000005"];
const check = async (h: ReturnType<typeof createHarness>, who: { post: (path: string) => Promise<Response> }) =>
  h.json<CheckResponse>(await who.post("/v1/checks"));

describe("複数MAC", () => {
  it("どれか1台が在校なら本人もフレンドも在校。建物が食い違うと伏せる", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/me/macs", { mac: extra[0], label: "Mac" });
    await bob.post("/v1/friends", { shareKey: alice.shareKey, via: "qr" });
    await alice.post(`/v1/friends/${bob.userId}/best`);
    await bob.post(`/v1/friends/${alice.userId}/best`);
    h.dtc.set(MAC.alice, { status: "absent" });
    h.dtc.set(extra[0], present("kappa"));
    expect((await check(h, alice)).me).toMatchObject({ presence: "present", buildingKey: "kappa" });
    expect((await check(h, bob)).friends[0]).toMatchObject({ present: true, buildingKey: "kappa" });
    h.dtc.set(MAC.alice, present("iota"));
    expect((await check(h, alice)).me).toMatchObject({ presence: "present", buildingKey: null });
    expect((await check(h, bob)).friends[0]).toEqual({ userId: alice.userId, present: true });
  });

  it("一部が判定不能なら本人に不明を返し、ポイントを付けない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    h.dtc.set(MAC.alice, { status: "unavailable" });
    const result = await check(h, alice);
    expect(result.me.presence).toBe("unknown");
    expect(result.points.awarded).toEqual([]);
  });

  it("5台の上限、所有者、最後の1台削除を守る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    const me = await h.json<Me>(await alice.get("/v1/me"));
    expect((await alice.del(`/v1/me/macs/${me.macs[0]?.id}`)).status).toBe(409);
    expect((await bob.patch(`/v1/me/macs/${me.macs[0]?.id}`, { label: "不正" })).status).toBe(404);
    for (let i = 0; i < 4; i++) expect((await alice.post("/v1/me/macs", { mac: extra[i], label: `端末${i}` })).status).toBe(201);
    const full = await h.json<Me>(await alice.get("/v1/me"));
    expect(full.macs).toHaveLength(5);
    expect((await alice.post("/v1/me/macs", { mac: extra[4], label: "6台目" })).status).toBe(409);
    const second = full.macs[1];
    expect(second).toBeDefined();
    expect((await alice.del(`/v1/me/macs/${second?.id}`)).status).toBe(204);
    expect((await alice.patch(`/v1/me/macs/${me.macs[0]?.id}`, { mac: extra[4], label: "更新" })).status).toBe(200);
  });
});
