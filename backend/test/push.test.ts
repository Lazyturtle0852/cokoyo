import { describe, expect, it } from "vitest";
import type { FriendsResponse, Me, PushKeyResponse } from "../../shared/app-types.js";
import { createHarness, MAC } from "./helpers.js";

const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};

async function friends() {
  const h = createHarness();
  const alice = await h.signUp("ゆうき", MAC.alice);
  const bob = await h.signUp("佐藤", MAC.bob);
  await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
  const bobId = h.repo.findByUserId(bob.userId)!.id;
  return { h, alice, bob, bobId };
}

describe("スライムの色", () => {
  it("選んだ色が自分とフレンドに返り、null で選ばない状態に戻る", async () => {
    const { h, alice, bob } = await friends();
    const me = await h.json<Me>(await alice.patch("/v1/me", { color: "mint" }));
    expect(me.color).toBe("mint");
    const list = await h.json<FriendsResponse>(await bob.get("/v1/friends"));
    expect(list.friends.find((f) => f.userId === alice.userId)?.color).toBe("mint");

    const back = await h.json<Me>(await alice.patch("/v1/me", { color: null }));
    expect(back.color).toBeUndefined();
  });

  it("色を変えても、ほかの設定は変わらない。決まっていない色は断る", async () => {
    const { h, alice } = await friends();
    await alice.patch("/v1/me", { hidden: true });
    const me = await h.json<Me>(await alice.patch("/v1/me", { color: "blue" }));
    expect(me.hidden).toBe(true);
    expect((await alice.patch("/v1/me", { color: "gold" })).status).toBe(400);
    expect((await alice.patch("/v1/me", { color: "__proto__" })).status).toBe(400);
  });
});

describe("プッシュ通知", () => {
  it("公開鍵はログインした人にだけ返す", async () => {
    const { h, alice } = await friends();
    expect((await h.call("/v1/push/key")).status).toBe(401);
    expect(await h.json<PushKeyResponse>(await alice.get("/v1/push/key"))).toEqual({ publicKey: "test-public-key" });
  });

  it("知っている通知サーバー以外の宛先は受け付けない", async () => {
    const { alice } = await friends();
    expect((await alice.post("/v1/push/subscriptions", { ...SUB, endpoint: "https://10.0.0.1/x" })).status).toBe(400);
    expect((await alice.post("/v1/push/subscriptions", { ...SUB, endpoint: "http://fcm.googleapis.com/x" })).status).toBe(400);
    expect((await alice.post("/v1/push/subscriptions", { ...SUB, endpoint: "https://fcm.googleapis.com.evil.example/x" })).status).toBe(400);
    expect((await alice.post("/v1/push/subscriptions", { ...SUB, keys: { p256dh: "a b", auth: "c" } })).status).toBe(400);
    expect((await alice.post("/v1/push/subscriptions", { ...SUB, endpoint: "https://web.push.apple.com/QGx" })).status).toBe(204);
  });

  it("つんつんでは通知しない（知らせるのは YO！だけ）", async () => {
    const { h, alice, bob } = await friends();
    await bob.post("/v1/push/subscriptions", SUB);
    await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 5 });
    expect(h.push.sent).toHaveLength(0);
  });

  it("どの端末でもログインが切れた人には送らず、宛先も消す", async () => {
    const { h, alice, bob, bobId } = await friends();
    await bob.post("/v1/push/subscriptions", SUB);
    h.repo.deleteSessionsOf(bobId);
    // 送るかどうかは、身代わりではなく本物の送信処理が決めるので、ここでは宛先が消えたことを見る
    const { createPushSender } = await import("../src/push.js");
    await createPushSender(h.repo).send(bobId, { title: "t", body: "b", url: "/", tag: "t" });
    expect(h.repo.listPush(bobId)).toHaveLength(0);
  });

  it("同じ宛先は1行のまま、取り消し・全端末ログアウトで消える", async () => {
    const { h, bob, bobId } = await friends();
    await bob.post("/v1/push/subscriptions", SUB);
    await bob.post("/v1/push/subscriptions", SUB);
    expect(h.repo.listPush(bobId)).toHaveLength(1);
    expect((await bob.del("/v1/push/subscriptions", { endpoint: SUB.endpoint })).status).toBe(204);
    expect(h.repo.listPush(bobId)).toHaveLength(0);

    await bob.post("/v1/push/subscriptions", SUB);
    await bob.post("/v1/auth/logout-all");
    expect(h.repo.listPush(bobId)).toHaveLength(0);
  });
});
