import { describe, expect, it } from "vitest";
import type { GreetingsResponse, GreetResponse } from "../../shared/app-types.js";
import { createHarness, MAC, present } from "./helpers.js";

/** 2人をフレンドにして、alice だけキャンパスで在校確認した状態にする */
async function setup() {
  const h = createHarness();
  const alice = await h.signUp("ゆうき", MAC.alice);
  const bob = await h.signUp("佐藤", MAC.bob);
  await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
  h.dtc.set(MAC.alice, present("kappa"));
  await alice.post("/v1/checks");
  const bobId = h.repo.findByUserId(bob.userId)!.id;
  return { h, alice, bob, bobId };
}

describe("YO！", () => {
  it("相手に通知し、相手のアプリにも届く。見たら消える", async () => {
    const { h, alice, bob, bobId } = await setup();
    const r = await alice.post(`/v1/friends/${bob.userId}/greet`);
    expect(r.status).toBe(202);
    expect(await h.json<GreetResponse>(r)).toEqual({ userId: bob.userId, status: "sent" });
    expect(h.push.sent).toEqual([expect.objectContaining({ userId: bobId })]);
    expect(h.push.sent[0]!.message).toMatchObject({ title: "YO！されました", body: "ゆうきさんもキャンパスにいるようです。" });

    const got = await h.json<GreetingsResponse>(await bob.get("/v1/greetings"));
    expect(got.greetings.map((g) => g.userId)).toEqual([alice.userId]);
    expect((await bob.del("/v1/greetings")).status).toBe(204);
    expect((await h.json<GreetingsResponse>(await bob.get("/v1/greetings"))).greetings).toEqual([]);
  });

  it("今日キャンパスで在校確認していない人は送れない", async () => {
    const { alice, bob } = await setup();
    expect((await bob.post(`/v1/friends/${alice.userId}/greet`)).status).toBe(409);
  });

  it("30分のあいだに同じ相手へ送り直しても、もう一度は知らせない", async () => {
    const { h, alice, bob } = await setup();
    await alice.post(`/v1/friends/${bob.userId}/greet`);
    const again = await h.json<GreetResponse>(await alice.post(`/v1/friends/${bob.userId}/greet`));
    expect(again.status).toBe("already");
    expect(h.push.sent).toHaveLength(1);

    // 相手が見たあとでも、30分以内なら知らせない
    await bob.del("/v1/greetings");
    expect((await h.json<GreetResponse>(await alice.post(`/v1/friends/${bob.userId}/greet`))).status).toBe("already");
    expect(h.push.sent).toHaveLength(1);
    expect((await h.json<GreetingsResponse>(await bob.get("/v1/greetings"))).greetings).toEqual([]);
  });

  it("かくれんぼ中でも送れる。ブロックされていれば黙って捨てる", async () => {
    const { h, alice, bob } = await setup();
    await alice.patch("/v1/me", { hidden: true });
    expect((await h.json<GreetResponse>(await alice.post(`/v1/friends/${bob.userId}/greet`))).status).toBe("sent");

    const h2 = await setup();
    await h2.bob.post(`/v1/friends/${h2.alice.userId}/block`);
    expect((await h2.alice.post(`/v1/friends/${h2.bob.userId}/greet`)).status).toBe(202);
    expect(h2.h.push.sent).toHaveLength(0);
    expect((await h2.h.json<GreetingsResponse>(await h2.bob.get("/v1/greetings"))).greetings).toEqual([]);
  });

  it("フレンドでない相手には送れない", async () => {
    const { h, alice } = await setup();
    const carol = await h.signUp("田中", MAC.carol);
    expect((await alice.post(`/v1/friends/${carol.userId}/greet`)).status).toBe(404);
  });
});
