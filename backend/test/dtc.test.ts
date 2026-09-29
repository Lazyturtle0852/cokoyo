import { afterEach, describe, expect, it, vi } from "vitest";
import { RealDtcClient } from "../src/dtc.js";

const MIN = 60 * 1000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MIN).toISOString();

/**
 * DTC の代わりに答える fetch。
 * processedAt は /health/snmp の latestProcessedAt。null ならヘルスチェックが落ちている。
 */
function fakeDtc(observedAt: string, processedAt: string | null) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/health/snmp")) {
      if (processedAt === null) throw new Error("down");
      return Response.json({ status: "ok", latestProcessedAt: processedAt });
    }
    return Response.json({ history: [{ time: observedAt, buildingKey: "iota" }] });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("最後に見えた記録の古さ", () => {
  it("最新の記録で見えていれば在校", async () => {
    fakeDtc(ago(5), ago(5));
    expect(await new RealDtcClient("https://dtc.test").latest("aa:bb:cc:dd:ee:ff"))
      .toEqual({ status: "present", buildingKey: "iota" });
  });

  it("1回取りこぼしただけなら在校のまま", async () => {
    fakeDtc(ago(10), ago(5));
    expect((await new RealDtcClient("https://dtc.test").latest("aa:bb:cc:dd:ee:ff")).status).toBe("present");
  });

  it("処理済みの最新より5分を超えて前なら、もういない", async () => {
    fakeDtc(ago(11), ago(5));
    expect((await new RealDtcClient("https://dtc.test").latest("aa:bb:cc:dd:ee:ff")).status).toBe("absent");
  });

  it("帰宅したあとは、最後に見えた建物が返ってきても在校にしない", async () => {
    fakeDtc(ago(90), ago(5));
    expect(await new RealDtcClient("https://dtc.test").latest("aa:bb:cc:dd:ee:ff")).toEqual({ status: "absent" });
  });

  it("DTC の処理が遅れているあいだは、今ではなく処理済みの最新と比べる", async () => {
    fakeDtc(ago(62), ago(60));
    expect((await new RealDtcClient("https://dtc.test").latest("aa:bb:cc:dd:ee:ff")).status).toBe("present");
  });

  it("ヘルスチェックが取れなければ今から5分遅れを基準にする", async () => {
    fakeDtc(ago(10), null);
    const client = new RealDtcClient("https://dtc.test");
    expect((await client.latest("aa:bb:cc:dd:ee:ff")).status).toBe("present");
    fakeDtc(ago(40), null);
    expect((await new RealDtcClient("https://dtc.test").latest("aa:bb:cc:dd:ee:ff")).status).toBe("absent");
  });

  it("ヘルスチェックは1分のあいだ使い回す", async () => {
    const fetch = fakeDtc(ago(5), ago(5));
    const client = new RealDtcClient("https://dtc.test");
    await Promise.all([client.latest("aa:bb:cc:dd:ee:01"), client.latest("aa:bb:cc:dd:ee:02"), client.latest("aa:bb:cc:dd:ee:03")]);
    const health = fetch.mock.calls.filter(([url]) => String(url).endsWith("/health/snmp"));
    expect(health).toHaveLength(1);
  });
});
