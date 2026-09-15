import { describe, expect, it, vi } from "vitest";

/**
 * 仕様06。ブロックされた相手だけ DTC を叩かずに即座に返ると、
 * 速さの差で「ブロックされている」ことが伝わってしまう。
 * 打ち切った分もリクエスト全体の下限を待ってから返すことを確認する。
 */
describe("応答時間の平坦化", () => {
  it("打ち切りだけのリクエストでも下限を下回らない", async () => {
    vi.resetModules();
    process.env.TIMING_FLOOR_MS = "150";

    const { createApp } = await import("../src/app.js");
    const { openDb } = await import("../src/db.js");
    const { createRepo } = await import("../src/repo.js");
    const { StubDtc } = await import("./helpers.js");

    const repo = createRepo(openDb(":memory:"));
    const app = createApp(repo, new StubDtc());

    const registered = await app.request("/api/v1/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mac: "a2b41c9e7703" }),
    });
    const { secret } = (await registered.json()) as { secret: string };

    const startedAt = performance.now();
    const res = await app.request("/api/v1/presence", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ share_keys: ["k_nonexistent", "k_also_nonexistent"] }),
    });
    const elapsed = performance.now() - startedAt;

    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(140);

    process.env.TIMING_FLOOR_MS = "0";
  });
});
