import { describe, expect, it } from "vitest";
import type { CheckResponse, GiftResponse, PointsResponse } from "../../shared/app-types.js";
import { createHarness, MAC, present } from "./helpers.js";

type Harness = ReturnType<typeof createHarness>;
type Person = Awaited<ReturnType<Harness["signUp"]>>;

const check = async (h: Harness, who: Person) => h.json<CheckResponse>(await who.post("/v1/checks"));

/** 2人をフレンドにして、どちらもキャンパスにいる状態にする */
async function pair() {
  const h = createHarness();
  const alice = await h.signUp("ゆうき", MAC.alice);
  const bob = await h.signUp("佐藤", MAC.bob);
  await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
  h.dtc.set(MAC.alice, present("kappa"));
  h.dtc.set(MAC.bob, present("iota"));
  return { h, alice, bob };
}

describe("スライムへのリアクション", () => {
  it("送った人のスライムが相手の画面に出たときに、まとめて1回だけ届く", async () => {
    const { h, alice, bob } = await pair();
    expect((await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 5 })).status).toBe(202);
    await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 3 });

    const first = await check(h, bob);
    expect(first.reactions).toEqual([{ userId: alice.userId, count: 8 }]);

    const second = await check(h, bob);
    expect(second.reactions).toEqual([]);
  });

  it("送った人がキャンパスにいない（スライムが出ない）あいだは届かず、出たときに届く", async () => {
    const { h, alice, bob } = await pair();
    await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 4 });
    h.dtc.set(MAC.alice, { status: "absent" });
    expect((await check(h, bob)).reactions).toEqual([]);

    h.dtc.set(MAC.alice, present("kappa"));
    expect((await check(h, bob)).reactions).toEqual([{ userId: alice.userId, count: 4 }]);
  });

  it("送った人がかくれんぼ中は届かない", async () => {
    const { h, alice, bob } = await pair();
    await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 2 });
    await alice.patch("/v1/me", { hidden: true });
    expect((await check(h, bob)).reactions).toEqual([]);
  });

  it("ためておけるのは99回まで", async () => {
    const { h, alice, bob } = await pair();
    for (let i = 0; i < 3; i++) await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 40 });
    expect((await check(h, bob)).reactions).toEqual([{ userId: alice.userId, count: 99 }]);
  });

  it("相手にブロックされていても 202 を返し、黙って捨てる", async () => {
    const { h, alice, bob } = await pair();
    await bob.post(`/v1/friends/${alice.userId}/block`);
    expect((await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 5 })).status).toBe(202);

    await bob.del(`/v1/friends/${alice.userId}/block`);
    expect((await check(h, bob)).reactions).toEqual([]);
  });

  it("フレンドでない相手や、回数がおかしいときは断る", async () => {
    const { h, alice, bob } = await pair();
    const carol = await h.signUp("田中", MAC.carol);
    expect((await alice.post(`/v1/friends/${carol.userId}/reactions`, { count: 1 })).status).toBe(404);
    expect((await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 0 })).status).toBe(400);
    expect((await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 1.5 })).status).toBe(400);
  });
});

describe("ポイントを贈る", () => {
  /** alice にポイントをためておく（はじめてのマッチ 70 ＋ 来校 20 ＝ 90pt） */
  async function funded() {
    const p = await pair();
    await check(p.h, p.alice);
    return p;
  }

  it("贈ると、贈った人の累計から引かれ、もらった人の累計に足される", async () => {
    const { h, alice, bob } = await funded();
    const res = await alice.post(`/v1/friends/${bob.userId}/gifts`, { pts: 50 });
    expect(res.status).toBe(201);
    const body = await h.json<GiftResponse>(res);
    expect(body.total).toBe(40);
    expect(body.gift).toMatchObject({ direction: "out", userId: bob.userId, displayName: "佐藤", pts: 50 });

    const bobs = await h.json<PointsResponse>(await bob.get("/v1/points"));
    expect(bobs.total).toBe(50);
    expect(bobs.gifts).toEqual([expect.objectContaining({ direction: "in", userId: alice.userId, pts: 50 })]);
    // 今日の獲得には入れない
    expect(bobs.today.items).toEqual([]);
  });

  it("もらったポイントは、マッチの判定に影響しない", async () => {
    const { h, alice, bob } = await funded();
    await alice.post(`/v1/friends/${bob.userId}/gifts`, { pts: 10 });
    const body = await check(h, bob);
    expect(body.points.awarded.map((a) => a.kind)).toEqual(["base", "first"]);
  });

  it("累計より多くは贈れない", async () => {
    const { h, alice, bob } = await funded();
    const res = await alice.post(`/v1/friends/${bob.userId}/gifts`, { pts: 100 });
    expect(res.status).toBe(409);
    expect((await h.json<{ error: { code: string } }>(res)).error.code).toBe("insufficient_points");
  });

  it("10pt 単位で 10〜1,000pt。1日に贈れるのは合計 1,000pt まで", async () => {
    const { h, alice, bob } = await funded();
    for (const pts of [0, 5, 15, 1010, "10"]) {
      expect((await alice.post(`/v1/friends/${bob.userId}/gifts`, { pts })).status).toBe(400);
    }
    // 上限の確かめのために、DB に直接ポイントを足しておく
    const aliceRow = h.repo.findByUserId(alice.userId);
    h.repo.addPoint(aliceRow!.id, "2026-01-01", "base", "テスト", 5000, null, null);

    expect((await alice.post(`/v1/friends/${bob.userId}/gifts`, { pts: 700 })).status).toBe(201);
    const over = await alice.post(`/v1/friends/${bob.userId}/gifts`, { pts: 400 });
    expect(over.status).toBe(409);
    expect((await h.json<{ error: { code: string; message: string } }>(over)).error)
      .toMatchObject({ code: "daily_limit", message: expect.stringContaining("あと 300pt") });
    expect((await alice.post(`/v1/friends/${bob.userId}/gifts`, { pts: 300 })).status).toBe(201);
  });

  it("フレンドでない相手・自分がブロックしている相手には贈れない", async () => {
    const { h, alice, bob } = await funded();
    const carol = await h.signUp("田中", MAC.carol);
    expect((await alice.post(`/v1/friends/${carol.userId}/gifts`, { pts: 10 })).status).toBe(404);
    await alice.post(`/v1/friends/${bob.userId}/block`);
    expect((await alice.post(`/v1/friends/${bob.userId}/gifts`, { pts: 10 })).status).toBe(404);
  });
});
