import { describe, expect, it } from "vitest";
import type { FriendsResponse, Me } from "../../shared/app-types.js";
import { createHarness, MAC } from "./helpers.js";

/** Set-Cookie から、そのまま送り返せる形（name=value）を取り出す */
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("端末の覚え（クッキー）", () => {
  it("登録するとクッキーが付き、端末トークンが無くてもそれだけで通る", async () => {
    const h = createHarness();
    const res = await h.call("/v1/users", {
      method: "POST",
      body: JSON.stringify({ displayName: "ゆうき", mac: MAC.alice }),
    });
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/^cokoyo_device=dt_/);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    // 400日ぶん
    expect(res.headers.get("set-cookie")).toContain("Max-Age=34560000");

    const me = await h.call("/v1/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect((await h.json<Me>(me)).displayName).toBe("ゆうき");
  });

  it("使うたびにクッキーの期限が延びる", async () => {
    const h = createHarness();
    const cookie = cookieOf(await h.call("/v1/users", {
      method: "POST",
      body: JSON.stringify({ displayName: "ゆうき", mac: MAC.alice }),
    }));
    const again = await h.call("/v1/me", { headers: { cookie } });
    expect(again.headers.get("set-cookie")).toContain("Max-Age=34560000");
  });

  it("ログアウトするとクッキーが消え、登録そのものは残る", async () => {
    const h = createHarness();
    const signUp = await h.call("/v1/users", {
      method: "POST",
      body: JSON.stringify({ displayName: "ゆうき", mac: MAC.alice }),
    });
    const cookie = cookieOf(signUp);

    const out = await h.call("/v1/sessions", { method: "DELETE" });
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");

    // 同じMACで入り直せる
    const back = await h.call("/v1/sessions", { method: "POST", body: JSON.stringify({ mac: MAC.alice }) });
    expect(back.status).toBe(200);
    // 入り直すと前の覚えは使えなくなる
    expect((await h.call("/v1/me", { headers: { cookie } })).status).toBe(401);
  });
});

describe("アイコンの写真", () => {
  it("登録すると自分にもフレンドにも見え、消すと元に戻る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await bob.post("/v1/friends", { shareKey: alice.shareKey, via: "qr" });

    const saved = await h.json<Me>(await h.call("/v1/me/avatar", {
      method: "PUT", token: alice.deviceToken, body: JSON.stringify({ image: PNG }),
    }));
    expect(saved.avatar).toBe(PNG);

    const seen = await h.json<FriendsResponse>(await bob.get("/v1/friends"));
    expect(seen.friends[0]?.avatar).toBe(PNG);

    const cleared = await h.json<Me>(await alice.del("/v1/me/avatar"));
    expect(cleared.avatar).toBeUndefined();
    expect((await h.json<FriendsResponse>(await bob.get("/v1/friends"))).friends[0]?.avatar).toBeUndefined();
  });

  it("画像でないもの・大きすぎるものは断る", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const put = (image: unknown) => h.call("/v1/me/avatar", {
      method: "PUT", token: alice.deviceToken, body: JSON.stringify({ image }),
    });

    expect((await put("https://example.com/a.png")).status).toBe(400);
    expect((await put("data:text/html;base64,AAAA")).status).toBe(400);
    expect((await put(`data:image/png;base64,${"A".repeat(130 * 1024)}`)).status).toBe(400);
  });
});
