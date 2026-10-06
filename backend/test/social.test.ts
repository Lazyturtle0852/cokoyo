import { describe, expect, it } from "vitest";
import type { CheckResponse } from "../../shared/app-types.js";
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

  it("同じ sendId で送り直されたぶんは足さない", async () => {
    const { h, alice, bob } = await pair();
    await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 5, sendId: "a1" });
    expect((await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 5, sendId: "a1" })).status).toBe(202);
    await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 2, sendId: "a2" });
    expect((await check(h, bob)).reactions).toEqual([{ userId: alice.userId, count: 7 }]);
    expect((await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 1, sendId: "x".repeat(65) })).status).toBe(400);
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
