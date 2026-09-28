import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { validateGoogleIdentity, type GoogleProvider } from "../src/auth.js";
import { openDb } from "../src/db.js";
import { createRepo } from "../src/repo.js";
import { StubDtc, MAC } from "./helpers.js";

const make = () => {
  const repo = createRepo(openDb(":memory:"));
  const provider: GoogleProvider = {
    async authorizationUrl(_verifier, state) { return new URL(`https://accounts.google.com/auth?state=${state}`); },
    async exchange() { return { sub: "google-user-1", email: "student@keio.jp" }; },
  };
  const app = createApp(repo, new StubDtc(), provider);
  return { app, repo };
};

const cookieValue = (header: string | null, name: string) =>
  new RegExp(`${name}=([^;]+)`).exec(header ?? "")?.[1] ?? "";

describe("Google login", () => {
  it("Workspaceの検証済みkeio.jpアカウントだけを受け入れる", () => {
    const base = { sub: "stable-sub", email: "student@keio.jp", hd: "keio.jp", email_verified: true };
    expect(validateGoogleIdentity(base)).toEqual({ sub: "stable-sub", email: "student@keio.jp" });
    for (const claims of [
      { ...base, hd: undefined }, { ...base, hd: "gmail.com" },
      { ...base, email: "student@gmail.com" }, { ...base, email_verified: false },
      { ...base, sub: "" },
    ]) expect(() => validateGoogleIdentity(claims)).toThrow("google_domain_rejected");
  });

  it("stateを一度だけ消費し、ログイン後の初回登録を要求する", async () => {
    const { app } = make();
    const start = await app.request("/api/v1/auth/google?add=sk_abcdefgh");
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get("location") as string).searchParams.get("state") as string;
    expect(cookieValue(start.headers.get("set-cookie"), "cokoyo_oauth")).toBe(state);

    const callback = await app.request(`/api/v1/auth/google/callback?state=${state}&code=ok`, {
      headers: { cookie: `cokoyo_oauth=${state}` },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("http://localhost:5173/?add=sk_abcdefgh");
    const token = cookieValue(callback.headers.get("set-cookie"), "cokoyo_session");
    expect(token).toBeTruthy();
    expect((await app.request("/api/v1/auth/session", { headers: { cookie: `cokoyo_session=${token}` } })).status).toBe(200);
    expect((await app.request("/api/v1/me", { headers: { cookie: `cokoyo_session=${token}` } })).status).toBe(403);

    const onboard = await app.request("/api/v1/onboarding", {
      method: "POST", headers: { cookie: `cokoyo_session=${token}`, origin: "http://localhost:5173", "content-type": "application/json" },
      body: JSON.stringify({ displayName: "学生", mac: MAC.alice, label: "iPhone" }),
    });
    expect(onboard.status).toBe(201);
    expect((await app.request("/api/v1/me", { headers: { cookie: `cokoyo_session=${token}` } })).status).toBe(200);
    expect((await app.request(`/api/v1/auth/google/callback?state=${state}&code=ok`, {
      headers: { cookie: `cokoyo_oauth=${state}` },
    })).status).toBe(400);
  });

  it("stateの不一致と他オリジンの更新を拒否する", async () => {
    const { app } = make();
    const start = await app.request("/api/v1/auth/google");
    const state = new URL(start.headers.get("location") as string).searchParams.get("state") as string;
    expect((await app.request(`/api/v1/auth/google/callback?state=${state}&code=ok`, {
      headers: { cookie: "cokoyo_oauth=wrong" },
    })).status).toBe(400);
    expect((await app.request("/api/v1/auth/logout", { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(403);
  });

  it("現在と全端末のセッションを失効できる", async () => {
    const { app, repo } = make();
    const user = repo.findOrCreateGoogleUser("google-user-1", "student@keio.jp");
    const one = "session-one";
    const two = "session-two";
    repo.createSession(user.id, one);
    repo.createSession(user.id, two);
    const session = (token: string) => app.request("/api/v1/auth/session", { headers: { cookie: `cokoyo_session=${token}` } });
    expect((await session(one)).status).toBe(200);
    expect((await session(two)).status).toBe(200);
    expect((await app.request("/api/v1/auth/logout", { method: "POST", headers: {
      cookie: `cokoyo_session=${one}`, origin: "http://localhost:5173",
    } })).status).toBe(204);
    expect((await session(one)).status).toBe(401);
    expect((await session(two)).status).toBe(200);
    expect((await app.request("/api/v1/auth/logout-all", { method: "POST", headers: {
      cookie: `cokoyo_session=${two}`, origin: "http://localhost:5173",
    } })).status).toBe(204);
    expect((await session(two)).status).toBe(401);
  });
});
