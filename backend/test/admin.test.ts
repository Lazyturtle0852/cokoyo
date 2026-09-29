import { describe, expect, it } from "vitest";
import type { AdminSessionResponse, AdminStatsResponse, DebugDbResponse } from "../../shared/app-types.js";
import { createAdminAuth } from "../src/admin.js";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { createRepo } from "../src/repo.js";
import { jstDate } from "../src/lib/time.js";
import { ADMIN_PASSWORD, createHarness, MAC, StubDtc } from "./helpers.js";

const login = (h: ReturnType<typeof createHarness>, password: string, ip = "203.0.113.1") =>
  h.call("/v1/admin/login", {
    method: "POST", body: JSON.stringify({ password }), headers: { "x-forwarded-for": ip },
  });

describe("管理用パスワード", () => {
  it("正しいパスワードで入れて、Cookie は HttpOnly・SameSite=Strict", async () => {
    const h = createHarness();
    expect(await h.json<AdminSessionResponse>(await h.call("/v1/admin/session"))).toEqual({ admin: false });

    expect((await login(h, "違う")).status).toBe(401);
    const res = await login(h, ADMIN_PASSWORD);
    expect(res.status).toBe(204);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);

    const get = await h.adminLogin();
    expect(await h.json<AdminSessionResponse>(await get("/v1/admin/session"))).toEqual({ admin: true });
  });

  it("改ざんした Cookie や期限切れでは入れない", async () => {
    let now = 1_000_000;
    const auth = createAdminAuth("pw", () => now);
    const token = auth.issue();
    expect(auth.verify(token)).toBe(true);
    expect(auth.verify(`${Number(token.split(".")[0]) + 1}.${token.split(".")[1]}`)).toBe(false);
    expect(auth.verify("garbage")).toBe(false);
    now += auth.TTL_MS + 1;
    expect(auth.verify(token)).toBe(false);
  });

  it("同じ IP から5回間違えると、正しいパスワードでもしばらく入れない", async () => {
    const h = createHarness();
    for (let i = 0; i < 5; i++) expect((await login(h, "違う")).status).toBe(401);
    expect((await login(h, ADMIN_PASSWORD)).status).toBe(429);
    // 別の IP からは入れる
    expect((await login(h, ADMIN_PASSWORD, "198.51.100.7")).status).toBe(204);
  });

  it("パスワードが設定されていなければ、入口は閉じている", async () => {
    const app = createApp(createRepo(openDb(":memory:")), new StubDtc(), null, createAdminAuth(""));
    const headers = { "content-type": "application/json", origin: "http://localhost:5173" };
    const res = await app.request("/api/v1/admin/login", { method: "POST", headers, body: JSON.stringify({ password: "" }) });
    expect(res.status).toBe(503);
    expect((await app.request("/api/v1/admin/stats")).status).toBe(503);
  });

  it("ほかのサイトからはログインできない", async () => {
    const h = createHarness();
    const res = await h.app.request("/api/v1/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
      headers: { "content-type": "application/json", origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });
});

describe("/v1/admin/stats", () => {
  it("入っていなければ 401", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    expect((await h.call("/v1/admin/stats")).status).toBe(401);
    expect((await alice.get("/v1/admin/stats")).status).toBe(401);
  });

  it("利用者数・アクティブ数・アクセス数を数える", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    h.repo.findOrCreateGoogleUser("pending-sub", "pending@keio.jp"); // 登録途中
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    await alice.get("/v1/me");
    await alice.get("/v1/me");
    await h.call("/v1/auth/session"); // ログインしていない
    await alice.post("/v1/feedback", { message: "地図が見やすいです" });
    await alice.get(`/v1/friends/${bob.userId}/nope`); // 404 は数えない

    const get = await h.adminLogin();
    await get("/v1/admin/stats"); // 管理画面そのものは数えない
    const stats = await h.json<AdminStatsResponse>(await get("/v1/admin/stats"));

    expect(stats.totals).toMatchObject({ users: 2, onboarding: 1, friendships: 1, feedback: 1 });
    expect(stats.active).toEqual({ today: 1, week: 1, month: 1 });
    expect(stats.daily).toHaveLength(30);
    const today = stats.daily.at(-1);
    expect(today?.date).toBe(jstDate());
    expect(today).toMatchObject({ signups: 3, activeUsers: 1, hits: 5, anonHits: 1 });

    // ルートは値を入れずに、パターンのまま数える
    expect(stats.routes).toContainEqual({ method: "GET", route: "/api/v1/me", hits: 2 });
    expect(stats.routes).toContainEqual({ method: "POST", route: "/api/v1/friends", hits: 1 });
    expect(JSON.stringify(stats.routes)).not.toContain(bob.userId);
    expect(JSON.stringify(stats.routes)).not.toContain("admin");

    const a = stats.users.find((u) => u.userId === alice.userId);
    expect(a).toMatchObject({ displayName: "ゆうき", onboarded: true, macs: 1, friends: 1, lastSeen: jstDate(), recentHits: 4 });
    expect(stats.feedback).toMatchObject([{ userId: alice.userId, message: "地図が見やすいです" }]);
  });
});

describe("/v1/admin/db", () => {
  it("メールと問い合わせも出すが、Google ID・共有キー・MAC原文・認証情報は出さない", async () => {
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    await alice.post("/v1/feedback", { message: "ありがとう" });
    const dump = await h.json<DebugDbResponse>(await (await h.adminLogin())("/v1/admin/db"));

    expect(dump.tables.find((t) => t.name === "users")?.columns).toContain("email");
    expect(dump.tables.map((t) => t.name)).toEqual(expect.arrayContaining(["feedback", "access_daily", "access_routes"]));
    const text = JSON.stringify(dump);
    expect(text).toContain("ありがとう");
    expect(text).not.toContain(MAC.alice);
    expect(text).not.toContain(alice.shareKey);
    expect(text).not.toContain(alice.sessionToken);
    expect(text).not.toContain("google_sub");
    expect(dump.tables.map((t) => t.name)).not.toContain("sessions");
  });
});
