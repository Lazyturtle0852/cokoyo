import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminLogsResponse, ClientNetworkError } from "../../shared/app-types.js";
import { OPS_KEEP } from "../src/repo.js";
import { createHarness, MAC } from "./helpers.js";

const failure = (over: Partial<ClientNetworkError> = {}): ClientNetworkError => ({
  at: new Date().toISOString(),
  method: "GET", path: "/v1/friends", online: true, visible: true, ms: 12, sinceLoad: 800,
  message: "Load failed",
  ...over,
});

const report = (h: ReturnType<typeof createHarness>, errors: unknown) =>
  h.call("/v1/client-errors", { method: "POST", body: JSON.stringify({ errors }) });

const logs = async (h: ReturnType<typeof createHarness>) => {
  const get = await h.adminLogin();
  return h.json<AdminLogsResponse>(await get("/v1/admin/logs"));
};

afterEach(() => vi.restoreAllMocks());

describe("繋がらなかった呼び出しの報告", () => {
  it("ログインしていなくても受け取り、ルートの形にして残す（ID は残さない）", async () => {
    const h = createHarness();
    const res = await report(h, [
      failure({ method: "POST", path: "/v1/friends/u_0123456789abcdef/best", online: false, visible: false }),
      failure({ path: "/v1/invites/sk_0123456789abcdef?x=1" }),
    ]);
    expect(res.status).toBe(204);

    const { events } = await logs(h);
    const routes = events.map((e) => `${e.method} ${e.route}`);
    expect(routes).toContain("POST /api/v1/friends/:userId/best");
    expect(routes).toContain("GET /api/v1/invites/:shareKey");
    expect(JSON.stringify(events)).not.toMatch(/u_0123|sk_0123/);

    const best = events.find((e) => e.route === "/api/v1/friends/:userId/best");
    expect(best).toMatchObject({
      source: "client", kind: "network", status: 0, online: false, visible: false, ms: 12, sinceLoad: 800,
      message: "Load failed",
    });
  });

  it("知らないパス・おかしな値は伏せるか捨てる。1回に受け取るのは20件まで", async () => {
    const h = createHarness();
    await report(h, [
      failure({ path: "/v1/nothing/here" }),
      { method: "GET" },
      "garbage",
      failure({ at: "2999-01-01T00:00:00Z", ms: -5, message: "x".repeat(500) }),
    ]);
    const { events } = await logs(h);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.route)).toContain("（不明なパス）");
    const odd = events.find((e) => e.route === "/api/v1/friends")!;
    expect(Date.parse(odd.at)).toBeLessThanOrEqual(Date.now());
    expect(odd.ms).toBeNull();
    expect(odd.message).toHaveLength(120);

    const h2 = createHarness();
    await report(h2, Array.from({ length: 30 }, () => failure()));
    expect((await logs(h2)).events).toHaveLength(20);
  });

  it("配列でなければ 400、ほかのサイトからは 403", async () => {
    const h = createHarness();
    expect((await report(h, "nope")).status).toBe(400);
    const res = await h.app.request("/api/v1/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ errors: [failure()] }),
    });
    expect(res.status).toBe(403);
  });
});

describe("サーバー側の記録", () => {
  it("5xx は残すが、例外の中身（MAC を含みうる）は名前だけ", async () => {
    const h = createHarness();
    vi.spyOn(h.dtc, "latest").mockRejectedValue(new TypeError(`lookup failed for ${MAC.alice}`));
    const alice = await h.signUp("アリス", MAC.alice);
    expect((await alice.post("/v1/checks")).status).toBe(500);

    const { events } = await logs(h);
    const error = events.find((e) => e.kind === "error");
    expect(error).toMatchObject({ source: "server", method: "POST", route: "/api/v1/checks", status: 500, message: "TypeError" });
    expect(JSON.stringify(events)).not.toContain(MAC.alice);
  });

  it("4xx や速い呼び出しは残さない。遅い呼び出しは残す", async () => {
    const h = createHarness();
    const alice = await h.signUp("アリス", MAC.alice);
    await alice.get("/v1/me");
    await h.call("/v1/me"); // 401
    expect((await logs(h)).events.filter((e) => e.route !== "/api/v1/admin/login")).toHaveLength(0);

    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (t += 4000));
    await alice.get("/v1/me");
    vi.restoreAllMocks();
    const slow = (await logs(h)).events.find((e) => e.kind === "slow");
    expect(slow).toMatchObject({ route: "/api/v1/me", status: 200 });
    expect(slow!.ms).toBeGreaterThanOrEqual(3000);
  });

  it("管理用パスワードなしでは読めない", async () => {
    const h = createHarness();
    expect((await h.call("/v1/admin/logs")).status).toBe(401);
  });

  it(`残すのは新しい ${OPS_KEEP} 件まで`, async () => {
    const h = createHarness();
    for (let i = 0; i < OPS_KEEP + 10; i++) h.repo.recordOps({ source: "server", kind: "start", message: String(i) });
    const get = await h.adminLogin();
    const { events, kept } = await h.json<AdminLogsResponse>(await get("/v1/admin/logs"));
    expect(kept).toBe(OPS_KEEP);
    expect(events[0]?.message).toBe(String(OPS_KEEP + 9));
  });
});
