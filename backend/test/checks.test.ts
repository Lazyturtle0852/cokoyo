import { describe, expect, it } from "vitest";
import type { CheckResponse, PointsResponse } from "../../shared/app-types.js";
import { createHarness, MAC, present } from "./helpers.js";

const check = async (h: ReturnType<typeof createHarness>, who: { post: (p: string) => Promise<Response> }) =>
  h.json<CheckResponse>(await who.post("/v1/checks"));

describe("在校の見え方", () => {
  it("ベストフレンドのときだけ建物が出る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    h.dtc.set(MAC.alice, present("kappa"));
    h.dtc.set(MAC.bob, present("iota"));

    const before = await check(h, alice);
    expect(before.friends[0]).toEqual({ userId: bob.userId, present: true });

    await alice.post(`/v1/friends/${bob.userId}/best`);
    await bob.post(`/v1/friends/${alice.userId}/best`);

    const after = await check(h, alice);
    expect(after.friends[0]).toEqual({ userId: bob.userId, present: true, building: "ι館" });
  });

  it("自分には、かくれんぼ中でも本当のことを返す", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    h.dtc.set(MAC.alice, present("kappa"));
    await alice.patch("/v1/me", { hidden: true });

    const body = await check(h, alice);
    expect(body.me).toEqual({ present: true, building: "κ館", hidden: true });
  });

  it("かくれんぼ中・ブロック中・不在は、すべて同じ present:false で区別できない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const hider = await h.signUp("鈴木", MAC.bob);
    const blocker = await h.signUp("伊藤", MAC.carol);

    for (const f of [hider, blocker]) {
      await alice.post("/v1/friends", { shareKey: f.shareKey, via: "qr" });
      await alice.post(`/v1/friends/${f.userId}/best`);
      await f.post(`/v1/friends/${alice.userId}/best`);
    }
    // 3人ともキャンパスにいる
    h.dtc.set(MAC.alice, present("kappa"));
    h.dtc.set(MAC.bob, present("iota"));
    h.dtc.set(MAC.carol, present("tau"));

    await hider.patch("/v1/me", { hidden: true });
    await blocker.post(`/v1/friends/${alice.userId}/block`);

    const body = await check(h, alice);
    for (const f of body.friends) {
      expect(f.present).toBe(false);
      expect(Object.keys(f).sort()).toEqual(["present", "userId"]);
    }
    // 隠れている相手・ブロックしている相手のMACは DTC に問い合わせない
    expect(h.dtc.asked).toEqual([MAC.alice]);
  });

  it("自分がブロックした相手は friends に出ない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    await alice.post(`/v1/friends/${bob.userId}/block`);

    expect((await check(h, alice)).friends).toHaveLength(0);
  });
});

describe("ポイント", () => {
  it("キャンパス外では何も入らない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);

    const body = await check(h, alice);
    expect(body.points.awarded).toEqual([]);
    expect(body.points.notice).toBe("キャンパス外なので、ポイントは入りません");
    expect(body.points.total).toBe(0);
  });

  it("来校ベースは1日1回。2回目以降は入らない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    h.dtc.set(MAC.alice, present("kappa"));

    const first = await check(h, alice);
    expect(first.points.awarded.map((a) => a.kind)).toEqual(["base"]);
    expect(first.points.total).toBe(250);

    const second = await check(h, alice);
    expect(second.points.awarded).toEqual([]);
    expect(second.points.total).toBe(250);
  });

  it("雨の日は、その日はじめて押したときだけボーナスが入る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    h.dtc.set(MAC.alice, present("kappa"));
    h.dtc.setWeather("rain");

    const body = await check(h, alice);
    expect(body.weather).toEqual({ condition: "rain", rainy: true });
    expect(body.points.awarded.map((a) => a.kind)).toEqual(["base", "rain"]);
    expect(body.points.total).toBe(250 + 125);
  });

  it("はじめてのマッチは750、同じ相手には1日1回だけ", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    h.dtc.set(MAC.alice, present("kappa"));
    h.dtc.set(MAC.bob, present("iota"));

    const first = await check(h, alice);
    const match = first.points.awarded.find((a) => a.kind === "first");
    expect(match).toMatchObject({ pts: 750, label: "佐藤さんとはじめてマッチ", userId: bob.userId });

    const second = await check(h, alice);
    expect(second.points.awarded).toEqual([]);
  });

  it("かくれんぼ中はマッチが入らない（来校ベースは入る）", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    await alice.patch("/v1/me", { hidden: true });
    h.dtc.set(MAC.alice, present("kappa"));
    h.dtc.set(MAC.bob, present("iota"));

    const body = await check(h, alice);
    expect(body.points.awarded.map((a) => a.kind)).toEqual(["base"]);
    expect(body.points.notice).toBe("かくれんぼ中は、フレンドとのマッチポイントは入りません");
  });

  it("マッチは1日10人まで", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    h.dtc.set(MAC.alice, present("kappa"));

    for (let i = 0; i < 12; i++) {
      const mac = `aa00000000${String(i).padStart(2, "0")}`;
      const friend = await h.signUp(`友${i}`, mac);
      await alice.post("/v1/friends", { shareKey: friend.shareKey, via: "qr" });
      h.dtc.set(mac, present("iota"));
    }

    const body = await check(h, alice);
    expect(body.points.awarded.filter((a) => a.kind === "first")).toHaveLength(10);
    expect(body.points.notice).toBe("フレンドとのマッチポイントは1日10人までです");
  });

  it("GET /v1/points は awarded と notice を含まない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    h.dtc.set(MAC.alice, present("kappa"));
    await check(h, alice);

    const body = await h.json<PointsResponse>(await alice.get("/v1/points"));
    expect(body.total).toBe(250);
    expect(body.today.total).toBe(250);
    expect(Object.keys(body).sort()).toEqual(["date", "today", "total"]);
  });
});
