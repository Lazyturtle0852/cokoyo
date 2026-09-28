import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { DtcClient, Lookup } from "../src/dtc.js";
import { createRepo } from "../src/repo.js";
import { newSecret } from "../src/auth.js";

/** 在校と天気を明示的に決められるスタブ。 */
export class StubDtc implements DtcClient {
  readonly asked: string[] = [];
  private readonly byMac = new Map<string, Lookup>();
  private condition = "cloudy";

  set(mac: string, lookup: Lookup): void {
    this.byMac.set(mac, lookup);
  }
  setWeather(condition: string): void {
    this.condition = condition;
  }
  async latest(mac: string): Promise<Lookup> {
    this.asked.push(mac);
    return this.byMac.get(mac) ?? { status: "absent" };
  }
  async weather(): Promise<string | null> {
    return this.condition;
  }
}

export function createHarness() {
  const dtc = new StubDtc();
  const repo = createRepo(openDb(":memory:"));
  const app = createApp(repo, dtc);

  const call = async (
    path: string,
    init: (RequestInit & { token?: string }) | undefined = undefined,
  ) => {
    const headers = new Headers(init?.headers);
    headers.set("content-type", "application/json");
    headers.set("origin", "http://localhost:5173");
    if (init?.token) headers.set("cookie", `cokoyo_session=${init.token}`);
    return app.request(`/api${path}`, { ...init, headers });
  };

  const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

  /** 登録して、その人を操作するための一式を返す。 */
  const signUp = async (displayName: string, mac: string) => {
    const sub = newSecret();
    const email = `${sub.slice(0, 12).toLowerCase()}@keio.jp`;
    const pending = repo.findOrCreateGoogleUser(sub, email);
    const user = repo.completeUser(pending.id, displayName, mac.replace(/[:-]/g, "").toLowerCase(), "端末");
    const sessionToken = newSecret();
    repo.createSession(user.id, sessionToken);
    const me = { userId: user.user_id, shareKey: user.share_key as string, sessionToken };
    return {
      ...me,
      mac,
      get: (p: string) => call(p, { token: me.sessionToken }),
      post: (p: string, body?: unknown) =>
        call(p, { method: "POST", token: me.sessionToken, body: body ? JSON.stringify(body) : undefined }),
      patch: (p: string, body: unknown) =>
        call(p, { method: "PATCH", token: me.sessionToken, body: JSON.stringify(body) }),
      del: (p: string) => call(p, { method: "DELETE", token: me.sessionToken }),
    };
  };

  return { app, repo, dtc, call, json, signUp };
}

export const MAC = {
  alice: "a2b41c9e7703",
  bob: "6e0d33b1c840",
  carol: "55e0a1b7cc94",
} as const;

export const present = (buildingKey?: string): Lookup =>
  ({ status: "present", ...(buildingKey ? { buildingKey } : {}) }) as Lookup;
