import { describe, expect, it } from "vitest";
import { normalizeMac, toColonMac } from "../src/lib/mac.js";
import { createHarness } from "./helpers.js";

describe("MACの正規化", () => {
  it("表記ゆれを吸収する", () => {
    for (const input of [
      "A2-B4-1C-9E-77-03",
      "a2:b4:1c:9e:77:03",
      "A2B41C9E7703",
      " a2b4.1c9e.7703 ",
    ]) {
      expect(normalizeMac(input)).toBe("a2b41c9e7703");
    }
  });

  it("桁が足りない・多いものは弾く", () => {
    expect(normalizeMac("a2b41c9e77")).toBeNull();
    expect(normalizeMac("a2b41c9e7703ff")).toBeNull();
    expect(normalizeMac("zzzzzzzzzzzz")).toBeNull();
  });

  it("DTC が要求するコロン区切りに戻せる", () => {
    expect(toColonMac("a2b41c9e7703")).toBe("a2:b4:1c:9e:77:03");
  });
});

describe("POST /register", () => {
  it("share_key と secret を返す", async () => {
    const h = createHarness();
    const res = await h.call("/register", {
      method: "POST",
      body: JSON.stringify({ mac: "A2-B4-1C-9E-77-03" }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, string>;
    expect(body.share_key).toMatch(/^k_[0-9a-f]{32}$/);
    expect(body.secret).toMatch(/^s_[0-9a-f]{32}$/);
    // MACは返さない
    expect(body.mac).toBeUndefined();
  });

  it("同じMACの再登録では share_key が変わらない（配り直しが起きない）", async () => {
    const h = createHarness();
    const first = await h.register("a2b41c9e7703");
    const second = await h.register("A2:B4:1C:9E:77:03");

    expect(second.share_key).toBe(first.share_key);
    // secret は作り直されるので、前の端末は無効になる
    expect(second.secret).not.toBe(first.secret);

    const oldToken = await h.call("/me", { secret: first.secret });
    expect(oldToken.status).toBe(401);
    const newToken = await h.call("/me", { secret: second.secret });
    expect(newToken.status).toBe(200);
  });

  it("書式が不正なMACは 400", async () => {
    const h = createHarness();
    const res = await h.call("/register", {
      method: "POST",
      body: JSON.stringify({ mac: "not-a-mac" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("connections", () => {
  it("存在しない key でも 200 を返し、行は作らない", async () => {
    const h = createHarness();
    const alice = await h.register("a2b41c9e7703");

    const res = await h.call("/connections", {
      method: "POST",
      secret: alice.secret,
      body: JSON.stringify({ share_key: "k_nonexistent" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      share_key: "k_nonexistent",
      scope: "campus",
      blocked: false,
    });

    const me = await (await h.call("/me", { secret: alice.secret })).json();
    expect((me as { connections: unknown[] }).connections).toEqual([]);
  });

  it("GET /me が自分の share_key とフレンド一覧を返す", async () => {
    const h = createHarness();
    const alice = await h.register("a2b41c9e7703");
    const bob = await h.register("6e0d33b1c840");

    await h.call("/connections", {
      method: "POST",
      secret: alice.secret,
      body: JSON.stringify({ share_key: bob.share_key }),
    });

    const me = (await (await h.call("/me", { secret: alice.secret })).json()) as {
      share_key: string;
      connections: Array<{ share_key: string; scope: string; blocked: boolean }>;
    };
    expect(me.share_key).toBe(alice.share_key);
    expect(me.connections).toEqual([
      { share_key: bob.share_key, scope: "campus", blocked: false },
    ]);
  });
});
