import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { DtcClient, Lookup } from "../src/dtc.js";
import { createRepo } from "../src/repo.js";

/** 在校を明示的に決められるスタブ。MAC単位で結果を差し込む。 */
export class StubDtc implements DtcClient {
  readonly asked: string[] = [];
  private readonly byMac = new Map<string, Lookup>();

  set(mac: string, lookup: Lookup): void {
    this.byMac.set(mac, lookup);
  }

  async latest(mac: string): Promise<Lookup> {
    this.asked.push(mac);
    return this.byMac.get(mac) ?? { status: "absent" };
  }
}

export function createHarness() {
  const dtc = new StubDtc();
  const repo = createRepo(openDb(":memory:"));
  const app = createApp(repo, dtc);

  const call = (path: string, init?: RequestInit & { secret?: string }) => {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    if (init?.secret) headers.set("authorization", `Bearer ${init.secret}`);
    return app.request(`/api/v1${path}`, { ...init, headers });
  };

  const register = async (mac: string) => {
    const res = await call("/register", { method: "POST", body: JSON.stringify({ mac }) });
    return (await res.json()) as { share_key: string; secret: string };
  };

  return { app, repo, dtc, call, register };
}
