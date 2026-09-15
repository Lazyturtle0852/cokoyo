import { describe, expect, it } from "vitest";
import type { AddFriendResponse, FriendsResponse } from "../../shared/app-types.js";
import { createHarness, MAC } from "./helpers.js";

describe("登録", () => {
  it("同じMACは二度登録できない", async () => {
    const h = createHarness();
    await h.signUp("ゆうき", MAC.alice);
    const res = await h.call("/v1/users", {
      method: "POST",
      body: JSON.stringify({ displayName: "だれか", mac: "A2-B4-1C-9E-77-03" }),
    });
    expect(res.status).toBe(409);
    expect((await h.json<{ error: { code: string } }>(res)).error.code).toBe("mac_taken");
  });

  it("MACそのものは返さず、マスクした形だけ返す", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const me = await h.json<Record<string, string>>(await alice.get("/v1/me"));
    expect(me.macMasked).toBe("a2:b4:••:••:••:03");
    expect(JSON.stringify(me)).not.toContain(MAC.alice);
  });

  it("表示名は1〜20文字", async () => {
    const h = createHarness();
    const res = await h.call("/v1/users", {
      method: "POST",
      body: JSON.stringify({ displayName: "", mac: MAC.bob }),
    });
    expect(res.status).toBe(400);
  });
});

describe("フレンド追加", () => {
  it("QRは即フレンド、リンクは承認待ち", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);

    const qr = await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    expect(qr.status).toBe(201);
    expect((await h.json<AddFriendResponse>(qr)).status).toBe("friends");

    const carol = await h.signUp("田中", MAC.carol);
    const link = await alice.post("/v1/friends", { shareKey: carol.shareKey, via: "link" });
    expect(link.status).toBe(202);
    expect((await h.json<AddFriendResponse>(link)).status).toBe("requested");
  });

  it("相手からの申請が来ていれば、リンクでもその場でフレンドになる", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);

    await bob.post("/v1/friends", { shareKey: alice.shareKey, via: "link" });
    const res = await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "link" });

    expect(res.status).toBe(201);
    expect((await h.json<AddFriendResponse>(res)).status).toBe("friends");
  });

  it("申請は届いた側にだけ incoming として見える", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "link" });

    const mine = await h.json<FriendsResponse>(await alice.get("/v1/friends"));
    const theirs = await h.json<FriendsResponse>(await bob.get("/v1/friends"));
    expect(mine.requests.outgoing).toHaveLength(1);
    expect(mine.requests.incoming).toHaveLength(0);
    expect(theirs.requests.incoming).toHaveLength(1);

    const requestId = theirs.requests.incoming[0]?.requestId as string;
    expect((await bob.post(`/v1/friend-requests/${requestId}/accept`)).status).toBe(200);
    expect((await h.json<FriendsResponse>(await bob.get("/v1/friends"))).friends).toHaveLength(1);
  });

  it("自分のキー・存在しないキーは弾く", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    expect((await alice.post("/v1/friends", { shareKey: alice.shareKey, via: "qr" })).status).toBe(400);
    expect((await alice.post("/v1/friends", { shareKey: "sk_nope", via: "qr" })).status).toBe(404);
  });

  it("相手にブロックされていても、それと分からない形で受け付ける", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    // フレンドにはならずにブロックだけしておく（already_friends と混ざらないように）
    await bob.post(`/v1/friends/${alice.userId}/block`);

    const res = await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    // ブロックされていない場合の link 申請と同じ 202
    expect(res.status).toBe(202);
    expect((await h.json<AddFriendResponse>(res)).status).toBe("requested");
    // 申請は相手に届かない
    const theirs = await h.json<FriendsResponse>(await bob.get("/v1/friends"));
    expect(theirs.requests.incoming).toHaveLength(0);
  });
});

describe("ベストフレンド", () => {
  it("両方が申請して初めて成立する", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });

    expect((await h.json<{ best: string }>(await alice.post(`/v1/friends/${bob.userId}/best`))).best)
      .toBe("outgoing");
    expect((await h.json<FriendsResponse>(await bob.get("/v1/friends"))).friends[0]?.best)
      .toBe("incoming");
    expect((await h.json<{ best: string }>(await bob.post(`/v1/friends/${alice.userId}/best`))).best)
      .toBe("best");
  });

  it("片方がやめれば両方 none に戻る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    await alice.post(`/v1/friends/${bob.userId}/best`);
    await bob.post(`/v1/friends/${alice.userId}/best`);

    await alice.del(`/v1/friends/${bob.userId}/best`);
    expect((await h.json<FriendsResponse>(await bob.get("/v1/friends"))).friends[0]?.best).toBe("none");
  });
});

describe("ブロック", () => {
  it("friends から外れて blocked に移り、ベストは解除される", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    await alice.post(`/v1/friends/${bob.userId}/best`);
    await bob.post(`/v1/friends/${alice.userId}/best`);

    await alice.post(`/v1/friends/${bob.userId}/block`);
    const mine = await h.json<FriendsResponse>(await alice.get("/v1/friends"));
    expect(mine.friends).toHaveLength(0);
    expect(mine.blocked).toHaveLength(1);

    // 相手には知らせない。フレンドのまま見えるが best は外れる
    const theirs = await h.json<FriendsResponse>(await bob.get("/v1/friends"));
    expect(theirs.friends).toHaveLength(1);
    expect(theirs.friends[0]?.best).toBe("none");

    await alice.del(`/v1/friends/${bob.userId}/block`);
    expect((await h.json<FriendsResponse>(await alice.get("/v1/friends"))).friends).toHaveLength(1);
  });
});

describe("認証", () => {
  it("shareKey では認証できない（配る値と秘密の値の分離）", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    expect((await h.call("/v1/me", { token: alice.shareKey })).status).toBe(401);
    expect((await h.call("/v1/me")).status).toBe(401);
  });
});
