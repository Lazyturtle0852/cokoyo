import { describe, expect, it } from "vitest";
import type { FriendsResponse, Me } from "../../shared/app-types.js";
import { createHarness, MAC } from "./helpers.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("アイコンの写真", () => {
  it("Googleで登録した自分とフレンドに表示され、削除で元に戻る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await bob.post("/v1/friends", { shareKey: alice.shareKey, via: "qr" });

    const saved = await h.json<Me>(await h.call("/v1/me/avatar", {
      method: "PUT", token: alice.sessionToken, body: JSON.stringify({ image: PNG }),
    }));
    expect(saved.avatar).toBe(PNG);
    const seen = await h.json<FriendsResponse>(await bob.get("/v1/friends"));
    expect(seen.friends[0]?.avatar).toBe(PNG);

    const dump = await h.json<{ tables: { name: string; columns: string[]; rows: unknown[][] }[] }>(await (await h.adminLogin())("/v1/debug/db"));
    const users = dump.tables.find((table) => table.name === "users");
    expect(users?.columns).toContain("avatar");
    expect(JSON.stringify(dump)).not.toContain(PNG);

    const cleared = await h.json<Me>(await alice.del("/v1/me/avatar"));
    expect(cleared.avatar).toBeUndefined();
    expect((await h.json<FriendsResponse>(await bob.get("/v1/friends"))).friends[0]?.avatar).toBeUndefined();
  });

  it("画像でないもの・大きすぎるものは断る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const put = (image: unknown) => h.call("/v1/me/avatar", {
      method: "PUT", token: alice.sessionToken, body: JSON.stringify({ image }),
    });
    expect((await put("https://example.com/a.png")).status).toBe(400);
    expect((await put("data:text/html;base64,AAAA")).status).toBe(400);
    expect((await put(`data:image/png;base64,${"A".repeat(130 * 1024)}`)).status).toBe(400);
  });
});
