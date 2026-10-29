import { afterEach, describe, expect, it, vi } from "vitest";
import type { InsightsResponse } from "../../shared/app-types.js";
import { createHarness, MAC, present } from "./helpers.js";

afterEach(() => vi.useRealTimers());

describe("運営者向けの分析", () => {
  it("管理用パスワードで入った人にだけ返す", async () => {
    const h = createHarness();
    expect((await h.call("/v1/admin/insights")).status).toBe(401);
    const admin = await h.adminLogin();
    expect((await admin("/v1/admin/insights")).status).toBe(200);
  });

  it("段階ごとの人数・つながり・回数を数え、名前やメールは入れない", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-29T03:00:00Z") }); // 平日（木曜）に固定する。土日は「直近」に入らない
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    const bob = await h.signUp("佐藤", MAC.bob);
    await h.signUp("田中", MAC.carol);
    h.repo.findOrCreateGoogleUser("sub-only-login", "onlylogin@keio.jp"); // ログインだけで止まった人
    await alice.post("/v1/friends", { shareKey: bob.shareKey, via: "qr" });
    h.dtc.set(MAC.alice, present("kappa"));
    await alice.post("/v1/checks");
    await bob.post("/v1/checks"); // キャンパス外
    await alice.post(`/v1/friends/${bob.userId}/reactions`, { count: 3 });

    const admin = await h.adminLogin();
    const r = await h.json<InsightsResponse>(await admin("/v1/admin/insights"));
    const step = (key: string) => r.funnel.find((f) => f.key === key)?.count;
    expect(step("login")).toBe(4);
    expect(step("onboarded")).toBe(3);
    expect(step("pressed")).toBe(2);
    expect(step("visited")).toBe(1);
    expect(r.network.zeroFriends).toBe(1);
    expect(r.network.friendPairs).toBe(1);
    expect(r.daily.at(-1)).toMatchObject({ checks: 2, visitors: 1 });
    expect(r.features.reactions5d).toBe(1);
    expect(r.heat.checks.flat().reduce((a, b) => a + b, 0)).toBe(2);
    expect(r.people).toHaveLength(4);
    const text = JSON.stringify(r);
    for (const secret of ["ゆうき", "佐藤", "@keio.jp", alice.userId, alice.shareKey]) expect(text).not.toContain(secret);
  });

  it("「直近」は平日で数え、土日は入れない", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-01T03:00:00Z") }); // 日曜
    const h = createHarness();
    const alice = await h.signUp("ゆうき", MAC.alice);
    await alice.post("/v1/checks");
    const admin = await h.adminLogin();
    const r = await h.json<InsightsResponse>(await admin("/v1/admin/insights"));
    expect(r.daily).toHaveLength(20);
    expect(r.daily.at(-1)?.date).toBe("2026-10-30"); // 直前の金曜まで
    expect(r.daily.some((d) => [0, 6].includes(new Date(`${d.date}T00:00:00Z`).getUTCDay()))).toBe(false);
    expect(r.people[0]).toMatchObject({ activeDays5: 0, checks20: 0 }); // 日曜に開いた分は数えない
  });
});
