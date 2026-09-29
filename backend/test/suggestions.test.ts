import { describe, expect, it } from "vitest";
import type { SuggestionsResponse } from "../../shared/app-types.js";
import { createHarness, MAC } from "./helpers.js";

type Harness = ReturnType<typeof createHarness>;
type Person = Awaited<ReturnType<Harness["signUp"]>>;

const mac = (n: number) => `aa00000000${String(n).padStart(2, "0")}`;

/** 2人をフレンドにする（QRで即成立） */
const befriend = (a: Person, b: Person) => a.post("/v1/friends", { shareKey: b.shareKey, via: "qr" });

/** お互いにベストフレンドにする */
const makeBest = async (a: Person, b: Person) => {
  await a.post(`/v1/friends/${b.userId}/best`);
  await b.post(`/v1/friends/${a.userId}/best`);
};

const list = async (h: Harness, who: Person) =>
  (await h.json<SuggestionsResponse>(await who.get("/v1/friends/suggestions"))).suggestions;

describe("知り合いかも", () => {
  it("共通のフレンドが2人以上いる相手が出る（1人だけなら出ない）", async () => {
    const h = createHarness();
    const me = await h.signUp("ゆうき", MAC.alice);
    const a = await h.signUp("佐藤", MAC.bob);
    const b = await h.signUp("田中", MAC.carol);
    const target = await h.signUp("高橋", mac(1));
    const weak = await h.signUp("伊藤", mac(2));

    await befriend(me, a);
    await befriend(me, b);
    await befriend(a, target);
    await befriend(b, target);   // 共通のフレンド2人
    await befriend(a, weak);     // 共通のフレンド1人だけ

    const suggestions = await list(h, me);
    expect(suggestions.map((s) => s.displayName)).toEqual(["高橋"]);
    // 共通のフレンドの名前を渡す（申請するかどうかの手がかり）
    expect(suggestions[0].mutual.map((u) => u.displayName).sort()).toEqual(["佐藤", "田中"]);
  });

  it("ベストフレンドのフレンドは、共通が1人でも出る", async () => {
    const h = createHarness();
    const me = await h.signUp("ゆうき", MAC.alice);
    const best = await h.signUp("佐藤", MAC.bob);
    const target = await h.signUp("高橋", mac(1));

    await befriend(me, best);
    await makeBest(me, best);
    await befriend(best, target);

    const suggestions = await list(h, me);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].displayName).toBe("高橋");
    expect(suggestions[0].mutual.map((u) => u.displayName)).toEqual(["佐藤"]);
  });

  it("すでにフレンド・申請中・ブロックしている／されている相手は出ない", async () => {
    const h = createHarness();
    const me = await h.signUp("ゆうき", MAC.alice);
    const best = await h.signUp("佐藤", MAC.bob);
    const already = await h.signUp("田中", MAC.carol);
    const pending = await h.signUp("高橋", mac(1));
    const blocked = await h.signUp("伊藤", mac(2));
    const blocker = await h.signUp("山田", mac(3));

    await befriend(me, best);
    await makeBest(me, best);
    for (const other of [already, pending, blocked, blocker]) await befriend(best, other);

    await befriend(me, already);                                  // すでにフレンド
    await me.post("/v1/friends", { shareKey: pending.shareKey, via: "link" }); // 申請中
    await befriend(me, blocked);
    await me.post(`/v1/friends/${blocked.userId}/block`);          // 自分がブロック
    await befriend(me, blocker);
    await blocker.post(`/v1/friends/${me.userId}/block`);          // 相手がブロック

    expect(await list(h, me)).toEqual([]);
  });

  it("「おすすめに出さない」にした人は出ない", async () => {
    const h = createHarness();
    const me = await h.signUp("ゆうき", MAC.alice);
    const best = await h.signUp("佐藤", MAC.bob);
    const target = await h.signUp("高橋", mac(1));

    await befriend(me, best);
    await makeBest(me, best);
    await befriend(best, target);
    expect(await list(h, me)).toHaveLength(1);

    await target.patch("/v1/me", { discoverable: false });
    expect(await list(h, me)).toEqual([]);
  });

  it("おすすめから申請すると、相手の承認待ちになる", async () => {
    const h = createHarness();
    const me = await h.signUp("ゆうき", MAC.alice);
    const best = await h.signUp("佐藤", MAC.bob);
    const target = await h.signUp("高橋", mac(1));
    await befriend(me, best);
    await makeBest(me, best);
    await befriend(best, target);

    const res = await me.post("/v1/friends", { userId: target.userId, via: "suggestion" });
    expect(res.status).toBe(202);
    expect(await list(h, me)).toEqual([]); // 申請中は出さない
  });
});
