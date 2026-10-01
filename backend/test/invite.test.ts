import { describe, expect, it } from "vitest";
import type { InviteResponse } from "../../shared/app-types.js";
import { createHarness, MAC } from "./helpers.js";

describe("招待の相手を調べる", () => {
  it("名前と関係を返し、申請はしない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);

    const res = await alice.get(`/v1/invites/${bob.shareKey}`);
    expect(res.status).toBe(200);
    const body = await h.json<InviteResponse>(res);
    expect(body.user.displayName).toBe("佐藤");
    expect(body.relation).toBe("none");
    // 調べただけでは、相手に申請は届かない
    expect((await h.json<InviteResponse>(await bob.get(`/v1/invites/${alice.shareKey}`))).relation).toBe("none");
  });

  it("申請中・申請が来ている・フレンドを見分ける", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "link" });

    const relation = async (who: typeof alice, key: string) =>
      (await h.json<InviteResponse>(await who.get(`/v1/invites/${key}`))).relation;
    expect(await relation(alice, bob.shareKey)).toBe("requested");
    expect(await relation(bob, alice.shareKey)).toBe("incoming");

    await bob.post("/v1/friends", { shareKey: alice.shareKey, via: "link" }); // 申請が来ていれば成立
    expect(await relation(alice, bob.shareKey)).toBe("friends");
  });

  it("自分・見つからない・ブロック中は断る。ブロックされていることは分からない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    const carol = await h.signUp("田中", MAC.carol);

    expect((await alice.get(`/v1/invites/${alice.shareKey}`)).status).toBe(400);
    expect((await alice.get("/v1/invites/sk_nothere0000")).status).toBe(404);

    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    await alice.post(`/v1/friends/${bob.userId}/block`);
    expect((await alice.get(`/v1/invites/${bob.shareKey}`)).status).toBe(409);

    await carol.post("/v1/friends", { shareKey: alice.shareKey, via: "qr" });
    await carol.post(`/v1/friends/${alice.userId}/block`);
    const fromBlocked = await alice.get(`/v1/invites/${carol.shareKey}`);
    expect(fromBlocked.status).toBe(200);
  });
});
