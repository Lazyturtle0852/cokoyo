import { Hono } from "hono";
import type {
  Connection,
  CreateConnectionRequest,
  MeResponse,
  PresenceRequest,
  PresenceResponse,
  PresenceResult,
  RegisterRequest,
  RegisterResponse,
  Scope,
  UpdateConnectionRequest,
} from "../../shared/api-types.js";
import { requirePerson } from "./auth.js";
import { config } from "./config.js";
import type { DtcClient } from "./dtc.js";
import { fail } from "./lib/errors.js";
import { normalizeMac } from "./lib/mac.js";
import { roundToFiveMinutes, sleep } from "./lib/time.js";
import type { Repo } from "./repo.js";

const MAX_KEYS_PER_REQUEST = 200;

/** /register だけは無認証なので、素朴な上限を置いておく。 */
function createRateLimiter(limitPerHour: number) {
  const seen = new Map<string, { count: number; resetAt: number }>();
  return (ip: string): boolean => {
    const now = Date.now();
    const entry = seen.get(ip);
    if (!entry || now > entry.resetAt) {
      seen.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
      return true;
    }
    entry.count += 1;
    return entry.count <= limitPerHour;
  };
}

function asConnection(shareKey: string, scope: Scope, blocked: boolean): Connection {
  return { share_key: shareKey, scope, blocked };
}

export function createRoutes(repo: Repo, dtc: DtcClient) {
  const app = new Hono();
  const allowRegister = createRateLimiter(config.registerRateLimit);

  app.get("/health", (c) => c.json({ ok: true, mock_dtc: config.mockDtc }));

  // ── POST /register ────────────────────────────────────────────
  app.post("/register", async (c) => {
    const ip =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (!allowRegister(ip)) fail("RATE_LIMITED", "Too many registrations");

    const body = await c.req.json<RegisterRequest>().catch(() => null);
    if (!body || typeof body.mac !== "string") {
      fail("VALIDATION_ERROR", "mac is required");
    }

    const mac = normalizeMac(body.mac);
    if (!mac) fail("VALIDATION_ERROR", "mac must be 12 hexadecimal digits");

    const { person, secret } = repo.register(mac);
    const response: RegisterResponse = { share_key: person.share_key, secret };
    return c.json(response);
  });

  // ── POST /connections ─────────────────────────────────────────
  app.post("/connections", async (c) => {
    const me = requirePerson(c, repo);
    const body = await c.req.json<CreateConnectionRequest>().catch(() => null);
    if (!body || typeof body.share_key !== "string") {
      fail("VALIDATION_ERROR", "share_key is required");
    }

    const other = repo.findByShareKey(body.share_key);

    // 存在しないkeyでも 200 を返す。404 を返すと、そのkeyが実在するかを
    // 総当たりで調べられてしまう（仕様06）。行だけ作らない。
    if (!other || other.id === me.id) {
      return c.json(asConnection(body.share_key, "campus", false));
    }

    const row = repo.connect(me.id, other.id);
    return c.json(
      asConnection(other.share_key, row?.scope ?? "campus", (row?.blocked ?? 0) !== 0),
    );
  });

  // ── PATCH /connections/:share_key ─────────────────────────────
  app.patch("/connections/:share_key", async (c) => {
    const me = requirePerson(c, repo);
    const shareKey = c.req.param("share_key");
    const body: UpdateConnectionRequest =
      (await c.req.json<UpdateConnectionRequest>().catch(() => null)) ?? {};

    if (body.scope !== undefined && body.scope !== "campus" && body.scope !== "building") {
      fail("VALIDATION_ERROR", "scope must be 'campus' or 'building'");
    }
    if (body.blocked !== undefined && typeof body.blocked !== "boolean") {
      fail("VALIDATION_ERROR", "blocked must be a boolean");
    }

    const other = repo.findByShareKey(shareKey);
    const existing = other && other.id !== me.id ? repo.getConnection(me.id, other.id) : undefined;

    const next = {
      scope: body.scope ?? existing?.scope ?? "campus",
      blocked: body.blocked ?? (existing?.blocked ?? 0) !== 0,
    };

    // つながっていない相手でも、同じ形を返して書き込まない。
    if (other && existing) repo.updateConnection(me.id, other.id, next);

    return c.json(asConnection(shareKey, next.scope, next.blocked));
  });

  // ── POST /presence ────────────────────────────────────────────
  app.post("/presence", async (c) => {
    const me = requirePerson(c, repo);

    // 打ち切ったリクエストが速く返ることで block を悟られないよう、下限を敷く。
    const floor = sleep(config.timingFloorMs);

    const body = await c.req.json<PresenceRequest>().catch(() => null);
    if (!body || !Array.isArray(body.share_keys)) {
      fail("VALIDATION_ERROR", "share_keys must be an array");
    }
    if (body.share_keys.length > MAX_KEYS_PER_REQUEST) {
      fail("VALIDATION_ERROR", `share_keys must contain at most ${MAX_KEYS_PER_REQUEST} entries`);
    }

    const allowed = new Map<string, { mac: string; scope: Scope }>();
    for (const conn of repo.listConnections(me.id)) {
      if (!conn.blocked) allowed.set(conn.other.share_key, { mac: conn.other.mac, scope: conn.scope });
    }
    // 自分自身は常に見える。
    allowed.set(me.share_key, { mac: me.mac, scope: "building" });

    let degraded = false;

    const results = await Promise.all(
      body.share_keys.map(async (shareKey): Promise<PresenceResult> => {
        const target = allowed.get(shareKey);

        // いない / ブロック / つながっていない / 存在しないkey は、すべてこの形。
        if (!target) return { share_key: shareKey, present: false };

        const lookup = await dtc.latest(target.mac);

        // DTC が答えられなかった場合も false に倒す。「いない」と同じ形にしないと、
        // 未登録のMACを持つ相手だけ違う見え方になってしまう。
        // どの相手だったかは示さず、レスポンス全体に degraded を立てるだけにする。
        if (lookup.status === "unavailable") {
          degraded = true;
          return { share_key: shareKey, present: false };
        }

        if (lookup.status === "absent") return { share_key: shareKey, present: false };

        // APが建物に紐づいていないと buildingKey は入らない。その場合も在校は真。
        return target.scope === "building" && lookup.buildingKey
          ? { share_key: shareKey, present: true, building: lookup.buildingKey }
          : { share_key: shareKey, present: true };
      }),
    );

    await floor;

    const response: PresenceResponse = {
      results,
      as_of: roundToFiveMinutes(new Date()),
      ...(degraded ? { degraded: true } : {}),
    };
    return c.json(response);
  });

  // ── GET /me ───────────────────────────────────────────────────
  app.get("/me", (c) => {
    const me = requirePerson(c, repo);
    const response: MeResponse = {
      share_key: me.share_key,
      connections: repo
        .listConnections(me.id)
        .map((conn) => asConnection(conn.other.share_key, conn.scope, conn.blocked)),
    };
    return c.json(response);
  });

  return app;
}
