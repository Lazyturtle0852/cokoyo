import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { routePath } from "hono/route";
import type {
  AddFriendResponse, AdminLogsResponse, AdminSessionResponse, AdminStatsResponse, BestResponse, BestState, BlockResponse, BuildingKey, CheckResponse,
  DebugDbResponse, FeedbackResponse, InviteResponse, Suggestion, SuggestionsResponse, FriendsResponse, Me, PointItem, PointsResponse, Reaction, ReactionResponse,
  MacAddressView, UserRef,
} from "../../shared/app-types.js";
import { BUILDING_LABELS } from "../../shared/app-types.js";
import { config } from "./config.js";
import type { AdminAuth } from "./admin.js";
import { newSecret, type GoogleProvider } from "./auth.js";
import type { DtcClient, Lookup } from "./dtc.js";
import { fail } from "./lib/errors.js";
import { maskMac, normalizeMac } from "./lib/mac.js";
import { jstDate, sleep } from "./lib/time.js";
import { awardPoints, isRainy, type VisibleFriend } from "./points.js";
import { OPS_KEEP, type FriendshipRow, type MacAddress, type OpsInput, type Repo, type User } from "./repo.js";

/** 地図に置く場所。APが建物に紐づいていなければ null。 */
const buildingKeyOf = (lookup: Lookup): BuildingKey | null =>
  lookup.status === "present" && lookup.buildingKey ? lookup.buildingKey : null;

const buildingLabel = (lookup: Lookup): string | null => {
  const key = buildingKeyOf(lookup);
  return key ? (BUILDING_LABELS[key] ?? null) : null;
};

const toRef = (u: User): UserRef => ({
  userId: u.user_id, displayName: u.display_name ?? "",
  ...(u.avatar ? { avatar: u.avatar } : {}),
});

const AVATAR = { MAX_BYTES: 120 * 1024, TYPES: ["image/jpeg", "image/png", "image/webp"] } as const;
function validAvatar(input: unknown): string {
  if (typeof input !== "string") fail(400, "invalid_avatar", "画像を送ってください");
  const image = input as string;
  const head = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!head || !AVATAR.TYPES.includes(head[1] as (typeof AVATAR.TYPES)[number])) {
    fail(400, "invalid_avatar", "画像の形式が正しくありません（JPEG・PNG・WebP）");
  }
  if (image.length > AVATAR.MAX_BYTES) fail(400, "avatar_too_large", "画像が大きすぎます");
  return image;
}

const toMac = (m: MacAddress): MacAddressView => ({
  id: m.id, label: m.label, macMasked: maskMac(m.mac), registeredAt: m.registered_at,
});

const toMe = (u: User, repo: Repo): Me => ({
  ...toRef(u),
  email: u.email,
  shareKey: u.share_key ?? "",
  hidden: u.hidden !== 0,
  discoverable: u.discoverable !== 0,
  macs: repo.listMacs(u.id).map(toMac),
});

/** best は片側ずつのフラグ。自分から見た状態に直す。 */
function bestState(row: FriendshipRow, me: number): BestState {
  const mine = me === row.user_low ? row.best_low : row.best_high;
  const theirs = me === row.user_low ? row.best_high : row.best_low;
  if (mine && theirs) return "best";
  if (mine) return "outgoing";
  if (theirs) return "incoming";
  return "none";
}

const otherIdOf = (row: FriendshipRow, me: number) =>
  row.user_low === me ? row.user_high : row.user_low;

const secureCookies = config.appOrigin.startsWith("https://");
const sessionCookie = secureCookies ? "__Host-cokoyo_session" : "cokoyo_session";
const oauthCookie = secureCookies ? "__Host-cokoyo_oauth" : "cokoyo_oauth";
const adminCookie = secureCookies ? "__Host-cokoyo_admin" : "cokoyo_admin";
const cookieOptions = { path: "/", httpOnly: true, secure: secureCookies, sameSite: "Lax" as const };

function requireUser(c: Parameters<typeof getCookie>[0], repo: Repo, completed = true): User {
  const token = getCookie(c, sessionCookie);
  if (!token) fail(401, "unauthorized", "Googleでログインしてください");
  const user = repo.findByToken(token);
  if (!user) fail(401, "unauthorized", "Googleでログインしてください");
  if (completed && !user.onboarding_completed_at) fail(403, "onboarding_required", "初回登録を完了してください");
  return user;
}

function validLabel(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.trim().length > 30) {
    fail(400, "invalid_label", "端末の名前は1〜30文字で入力してください");
  }
  return input.trim();
}

function translateMacError(error: unknown): never {
  if (error instanceof Error && error.message.includes("mac_addresses.mac")) {
    fail(409, "mac_taken", "このMACアドレスはすでに登録されています");
  }
  if (error instanceof Error && error.message === "mac_limit") fail(409, "mac_limit", "登録できる端末は5台までです");
  if (error instanceof Error && error.message === "last_mac") fail(409, "last_mac", "最後の端末は削除できません");
  throw error;
}

function validName(input: unknown): string {
  if (typeof input !== "string") fail(400, "invalid_name", "表示名を入力してください");
  const name = (input as string).trim();
  if (name.length < 1 || name.length > 20) {
    fail(400, "invalid_name", "表示名は1〜20文字で入力してください");
  }
  return name;
}

function validMac(input: unknown): string {
  if (typeof input !== "string") fail(400, "invalid_mac", "MACアドレスを入力してください");
  const mac = normalizeMac(input as string);
  if (!mac) fail(400, "invalid_mac", "MACアドレスの形式が正しくありません");
  return mac;
}

/** 「知り合いかも」に出す人数 */
const SUGGESTION_LIMIT = 10;

/** 1日に送れる問い合わせの数 */
const FEEDBACK_PER_DAY = 5;

/** 1組（送り手→受け手）にためておけるリアクションの数と、届かないまま捨てるまでの時間。 */
export const REACTION = { MAX: 99, TTL_MS: 3 * 24 * 60 * 60 * 1000 } as const;

function limiter(max: number) {
  let active = 0;
  const pending: Array<() => void> = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => pending.push(resolve));
    active++;
    try { return await work(); }
    finally { active--; pending.shift()?.(); }
  };
}

async function lookupUser(repo: Repo, dtc: DtcClient, user: User, limited: ReturnType<typeof limiter>): Promise<Lookup> {
  const observations = await Promise.all(repo.listMacs(user.id).map((m) => limited(() => dtc.latest(m.mac))));
  const present = observations.filter((x): x is Extract<Lookup, { status: "present" }> => x.status === "present");
  if (present.length) {
    const keys = new Set(present.map((x) => x.buildingKey));
    const buildingKey = observations.some((x) => x.status === "unavailable") || keys.size !== 1
      ? undefined : present[0]?.buildingKey;
    return { status: "present", ...(buildingKey ? { buildingKey } : {}) };
  }
  return observations.some((x) => x.status === "unavailable")
    ? { status: "unavailable" } : { status: "absent" };
}

const pointsView = (repo: Repo, me: User): PointsResponse => {
  const date = jstDate();
  const items = repo.pointsOfDay(me.id, date).map((row): PointItem => {
    const other = row.other_user_id === null ? undefined : repo.findById(row.other_user_id);
    return {
      kind: row.kind as PointItem["kind"],
      label: row.label,
      pts: row.pts,
      ...(other ? { userId: other.user_id } : {}),
      ...(row.days === null ? {} : { days: row.days }),
    };
  });
  return {
    date,
    today: { items, total: items.reduce((sum, i) => sum + i.pts, 0) },
    total: repo.pointsTotal(me.id),
  };
};

/**
 * リアクションを送る相手を引く。
 * フレンドでない・自分がブロックしている相手は 404。
 * 相手にブロックされているかどうかは、ここでは区別しない（呼ぶ側が黙って扱う）。
 */
function friendTarget(repo: Repo, me: User, userId: string): User {
  const other = repo.findByUserId(userId);
  const row = other ? repo.getFriendship(me.id, other.id) : undefined;
  if (!other || !row || row.status !== "friends" || repo.isBlocking(me.id, other.id)) {
    fail(404, "friend_not_found", "フレンドが見つかりません");
  }
  return other;
}

/**
 * 呼び出し元の IP。手前の Apache / Caddy が X-Forwarded-For の末尾に本当の接続元を足すので、
 * 末尾だけを信じる（先頭は送り手が好きに書ける）。管理用パスワードの連続失敗を数えるのに使う。
 */
const clientIp = (c: Parameters<typeof getCookie>[0]) =>
  c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";

/** 管理画面と、その集計に使う呼び出しはアクセス数に入れない。 */
const UNCOUNTED = /^\/api\/(health$|v1\/admin\/|v1\/debug\/|v1\/client-errors$)/;

/** これより時間がかかった呼び出しは、運用ログに「遅い」として残す。DTC の待ちは1回4秒まで */
const SLOW_MS = 3000;
/** ブラウザが1回に送ってよい件数（端末に溜めるのも同じ数まで） */
const CLIENT_ERRORS_MAX = 20;
const DAY_MS = 86_400_000;

/**
 * ブラウザから届いた1件を、残してよい形に直す。形がおかしければ null。
 * route は呼び出し元が決めた routeOf で、実在するルートの形に置き換える（値は残さない）。
 */
function toClientOps(input: unknown, routeOf: (method: string, path: string) => string | null): OpsInput | null {
  if (!input || typeof input !== "object") return null;
  const e = input as Record<string, unknown>;
  const method = typeof e.method === "string" ? e.method.toUpperCase() : "";
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return null;
  if (typeof e.path !== "string" || e.path.length > 300) return null;
  const ms = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 7 * DAY_MS ? (v as number) : null);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  // 端末の時計を信じすぎない。先すぎる・古すぎるものは受け取った時刻にする
  const now = Date.now();
  const t = typeof e.at === "string" ? Date.parse(e.at) : NaN;
  const at = Number.isFinite(t) && t <= now + 5 * 60_000 && t >= now - 7 * DAY_MS ? new Date(t).toISOString() : undefined;
  return {
    source: "client", kind: "network", at, method,
    route: routeOf(method, e.path.split("?")[0] ?? "") ?? "（不明なパス）",
    status: 0, ms: ms(e.ms), online: bool(e.online), visible: bool(e.visible), sinceLoad: ms(e.sinceLoad),
    message: typeof e.message === "string" ? e.message.slice(0, 120) : null,
  };
}

/** /v1 の下に生やす。フロントは apiBaseUrl + "/v1/..." で叩く。 */
export function createRoutes(repo: Repo, dtc: DtcClient, google: GoogleProvider | null, admin: AdminAuth) {
  const app = new Hono();

  const requireAdmin = (c: Parameters<typeof getCookie>[0]) => {
    if (!admin.enabled) fail(503, "admin_unavailable", "管理用パスワードが設定されていません");
    if (!admin.verify(getCookie(c, adminCookie))) fail(401, "admin_required", "管理用パスワードを入力してください");
  };

  // ── 運用ログ ──────────────────────────────────────────────
  // 5xx と遅い呼び出しだけを ops_events に残す。管理画面の「ログ」で見る。
  // 例外の中身は MAC を含みうるので、名前（ApiFailure ならコード）だけにする。
  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    const ms = Math.round(performance.now() - started);
    const status = c.res.status;
    if (status < 500 && ms < SLOW_MS) return;
    const route = routePath(c, -1);
    const err = c.error as (Error & { code?: string }) | undefined;
    try {
      repo.recordOps({
        source: "server", kind: status >= 500 ? "error" : "slow", method: c.req.method,
        route: route && !route.endsWith("*") ? route : "（該当なし）", status, ms,
        message: err ? (err.code ?? err.name) : null,
      });
    } catch (error) {
      console.error("ops log failed:", error instanceof Error ? error.name : "unknown");
    }
  });

  // ── アクセス数 ────────────────────────────────────────────
  // 1日・1人ごと、1日・ルートごとの回数だけを足す。URL の中の値（userId など）や IP は残さない。
  app.use("*", async (c, next) => {
    await next();
    if (UNCOUNTED.test(c.req.path)) return;
    const route = routePath(c, -1);
    if (!route || route.endsWith("*")) return; // どのルートにも当たらなかった（404）
    try {
      const token = getCookie(c, sessionCookie);
      const user = token ? repo.findByToken(token) : undefined;
      repo.recordAccess(jstDate(), user?.id ?? 0, c.req.method, route);
    } catch (error) {
      // 数え損ねても、本来の応答は返す。
      console.error("access count failed:", error instanceof Error ? error.name : "unknown");
    }
  });

  app.get("/health", (c) => c.json({ ok: true, mock_dtc: config.mockDtc }));

  // ── Googleログイン・自分 ───────────────────────────────────
  app.use("/v1/*", async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.req.header("origin") !== config.appOrigin) {
      fail(403, "invalid_origin", "この操作はこのサイトからだけ実行できます");
    }
    await next();
  });

  app.get("/v1/auth/google", async (c) => {
    if (!google) fail(503, "auth_unavailable", "Googleログインが設定されていません");
    const key = c.req.query("add") ?? "";
    const returnTo = /^sk_[0-9A-Za-z]{4,64}$/.test(key) ? `/?add=${encodeURIComponent(key)}` : "/";
    const state = newSecret();
    const verifier = newSecret();
    const nonce = newSecret();
    repo.createFlow(state, verifier, nonce, returnTo);
    setCookie(c, oauthCookie, state, { ...cookieOptions, maxAge: 600 });
    return c.redirect((await google.authorizationUrl(verifier, state, nonce)).href, 302);
  });

  app.get("/v1/auth/google/callback", async (c) => {
    const state = c.req.query("state") ?? "";
    const cookie = getCookie(c, oauthCookie);
    if (!state || !cookie || state !== cookie) fail(400, "invalid_state", "ログインをやり直してください");
    const flow = repo.consumeFlow(state);
    deleteCookie(c, oauthCookie, cookieOptions);
    if (!flow || !google) fail(400, "invalid_state", "ログインをやり直してください");
    let identity;
    try {
      const callbackUrl = new URL(`${config.appOrigin}/api/v1/auth/google/callback${new URL(c.req.url).search}`);
      identity = await google.exchange(callbackUrl, flow.code_verifier, state, flow.nonce);
    } catch {
      fail(401, "google_login_failed", "Googleログインを確認できませんでした");
    }
    const collision = repo.findByEmail(identity.email);
    if (collision && collision.google_sub !== identity.sub) {
      fail(409, "email_conflict", "このメールアドレスの登録を確認できませんでした。運営に連絡してください");
    }
    const user = repo.findOrCreateGoogleUser(identity.sub, identity.email);
    if (identity.displayName) repo.setGoogleNameIfUnset(user.id, identity.displayName);
    if (identity.avatar) repo.setGoogleAvatarIfUnset(user.id, identity.avatar);
    const token = newSecret();
    repo.createSession(user.id, token);
    setCookie(c, sessionCookie, token, { ...cookieOptions, maxAge: 14 * 86400 });
    return c.redirect(`${config.appOrigin}${flow.return_to}`, 302);
  });

  app.get("/v1/auth/session", (c) => {
    const user = requireUser(c, repo, false);
    return c.json({ email: user.email, displayName: user.display_name ?? "", status: user.onboarding_completed_at ? "ready" : "onboarding" });
  });

  app.post("/v1/auth/logout", (c) => {
    const token = getCookie(c, sessionCookie);
    if (token) repo.deleteSession(token);
    deleteCookie(c, sessionCookie, cookieOptions);
    return c.body(null, 204);
  });

  app.post("/v1/auth/logout-all", (c) => {
    const user = requireUser(c, repo, false);
    repo.deleteSessionsOf(user.id);
    deleteCookie(c, sessionCookie, cookieOptions);
    return c.body(null, 204);
  });

  app.post("/v1/onboarding", async (c) => {
    const user = requireUser(c, repo, false);
    if (user.onboarding_completed_at) fail(409, "already_onboarded", "初回登録は完了しています");
    const body = await c.req.json().catch(() => null);
    const name = validName(body?.displayName);
    const mac = validMac(body?.mac);
    const label = validLabel(body?.label);
    if (repo.findByMac(mac)) fail(409, "mac_taken", "このMACアドレスはすでに登録されています");
    try { return c.json(toMe(repo.completeUser(user.id, name, mac, label), repo), 201); }
    catch (error) { translateMacError(error); }
  });

  app.get("/v1/me", (c) => c.json(toMe(requireUser(c, repo), repo)));
  app.patch("/v1/me", async (c) => {
    const me = requireUser(c, repo);
    const body = await c.req.json().catch(() => null);
    const displayName = body?.displayName === undefined ? me.display_name ?? "" : validName(body.displayName);
    if (body?.hidden !== undefined && typeof body.hidden !== "boolean") {
      fail(400, "invalid_hidden", "かくれんぼの設定が正しくありません");
    }
    const hidden = body?.hidden === undefined ? me.hidden !== 0 : body.hidden;
    if (body?.discoverable !== undefined && typeof body.discoverable !== "boolean") {
      fail(400, "invalid_discoverable", "おすすめの設定が正しくありません");
    }
    const discoverable = body?.discoverable === undefined ? me.discoverable !== 0 : body.discoverable;
    repo.updateProfile(me.id, displayName, hidden, discoverable);
    return c.json(toMe(repo.findById(me.id) as User, repo));
  });

  app.put("/v1/me/avatar", async (c) => {
    const me = requireUser(c, repo);
    const image = validAvatar((await c.req.json().catch(() => null))?.image);
    repo.updateAvatar(me.id, image);
    return c.json(toMe(repo.findById(me.id) as User, repo));
  });
  app.delete("/v1/me/avatar", (c) => {
    const me = requireUser(c, repo);
    repo.updateAvatar(me.id, null);
    return c.json(toMe(repo.findById(me.id) as User, repo));
  });

  app.get("/v1/me/macs", (c) => {
    const me = requireUser(c, repo);
    return c.json({ macs: repo.listMacs(me.id).map(toMac), limit: 5 });
  });
  app.post("/v1/me/macs", async (c) => {
    const me = requireUser(c, repo);
    const body = await c.req.json().catch(() => null);
    const mac = validMac(body?.mac);
    const label = validLabel(body?.label);
    if (repo.findByMac(mac)) fail(409, "mac_taken", "このMACアドレスはすでに登録されています");
    try { return c.json(toMac(repo.addMac(me.id, mac, label)), 201); }
    catch (error) { translateMacError(error); }
  });
  app.patch("/v1/me/macs/:id", async (c) => {
    const me = requireUser(c, repo);
    const id = Number(c.req.param("id"));
    const old = Number.isSafeInteger(id) ? repo.getMac(id) : undefined;
    if (!old || old.user_id !== me.id) fail(404, "mac_not_found", "この端末は見つかりません");
    const body = await c.req.json().catch(() => null);
    const mac = body?.mac === undefined ? old.mac : validMac(body.mac);
    const label = body?.label === undefined ? old.label : validLabel(body.label);
    const owner = repo.findByMac(mac);
    if (owner && owner.id !== me.id) fail(409, "mac_taken", "このMACアドレスはすでに登録されています");
    if (repo.listMacs(me.id).some((m) => m.id !== id && m.mac === mac)) fail(409, "mac_taken", "このMACアドレスはすでに登録されています");
    try { return c.json(toMac(repo.editMac(me.id, id, mac, label))); }
    catch (error) { translateMacError(error); }
  });
  app.delete("/v1/me/macs/:id", (c) => {
    const me = requireUser(c, repo);
    const id = Number(c.req.param("id"));
    const old = Number.isSafeInteger(id) ? repo.getMac(id) : undefined;
    if (!old || old.user_id !== me.id) fail(404, "mac_not_found", "この端末は見つかりません");
    try { repo.removeMac(me.id, id); return c.body(null, 204); }
    catch (error) { translateMacError(error); }
  });

  // ── 在校確認とポイント ────────────────────────────────────
  app.post("/v1/checks", async (c) => {
    const me = requireUser(c, repo);
    // 打ち切った相手が速く返ることで、ブロックやかくれんぼを悟られないようにする。
    const floor = sleep(config.timingFloorMs);

    // 自分がブロックした相手は、ここには出さない（ブロック中の一覧に出るため）。
    const friends = repo
      .listFriendships(me.id)
      .filter((row) => row.status === "friends")
      .map((row) => ({ row, other: repo.findById(otherIdOf(row, me.id)) }))
      .filter((f): f is { row: FriendshipRow; other: User } => Boolean(f.other))
      .filter((f) => !repo.isBlocking(me.id, f.other.id));

    const limited = limiter(8);
    const [mine, ...theirs] = await Promise.all([
      lookupUser(repo, dtc, me, limited),
      ...friends.map(async (f) => {
        // WiFiに繋がっていない・かくれんぼ中・相手が自分をブロック中は、
        // すべて同じ「いない」にする。理由は区別しない。
        if (f.other.hidden !== 0 || repo.isBlocking(f.other.id, me.id)) {
          return { status: "absent" } as Lookup;
        }
        return lookupUser(repo, dtc, f.other, limited);
      }),
    ]);

    const condition = (await dtc.weather()) ?? "unknown";
    const rainy = isRainy(condition === "unknown" ? null : condition);

    const visible: VisibleFriend[] = friends.map((f, i) => ({
      user: f.other,
      present: theirs[i]?.status === "present",
    }));

    const today = jstDate();
    const { awarded, notice } = repo.transaction(() => awardPoints(repo, me, {
      present: mine?.status === "present",
      rainy,
      friends: visible,
      today,
    }));

    // 画面に出たフレンドのスライムから、届いていたリアクションを渡す。
    // 在校が見えている＝相手の画面では自分のスライムが見えている、とは限らないが、
    // 「送った人のスライムが、受け取る人の画面に出たとき」に届けばよいので、これで足りる。
    const now = Date.now();
    const reactions: Reaction[] = [];
    visible.forEach((f) => {
      if (!f.present) return;
      const r = repo.takeReaction(f.user.id, me.id);
      if (r && now - new Date(r.updated_at).getTime() <= REACTION.TTL_MS) {
        reactions.push({ userId: f.user.user_id, count: r.count });
      }
    });

    const response: CheckResponse = {
      checkedAt: new Date().toISOString(),
      me: {
        presence: mine?.status === "present" ? "present" : mine?.status === "unavailable" ? "unknown" : "absent",
        // かくれんぼ中でも、本人には本当のことを返す。
        building: mine ? buildingLabel(mine) : null,
        buildingKey: mine ? buildingKeyOf(mine) : null,
        hidden: me.hidden !== 0,
      },
      weather: { condition, rainy },
      friends: friends.map((f, i) => {
        const lookup = theirs[i];
        const present = lookup?.status === "present";
        // 建物を出すのはベストフレンド同士のときだけ。
        // 地図に出す buildingKey も、まったく同じ条件で出し分ける。
        const shown = present && bestState(f.row, me.id) === "best" && lookup ? lookup : null;
        const label = shown ? buildingLabel(shown) : null;
        const key = shown ? buildingKeyOf(shown) : null;
        return {
          userId: f.other.user_id,
          present,
          ...(label ? { building: label } : {}),
          ...(key ? { buildingKey: key } : {}),
        };
      }),
      points: { awarded, notice: mine?.status === "unavailable" ? "在校を判定できなかったため、ポイントは入りません" : notice, ...pointsView(repo, me) },
      reactions,
    };

    await floor;
    return c.json(response);
  });

  app.get("/v1/points", (c) => c.json(pointsView(repo, requireUser(c, repo))));

  // ── フレンド ──────────────────────────────────────────────
  app.get("/v1/friends", (c) => {
    const me = requireUser(c, repo);
    const blockedIds = new Set(repo.listBlocks(me.id).map((b) => b.other_id));

    const response: FriendsResponse = {
      friends: [],
      requests: { incoming: [], outgoing: [] },
      blocked: repo
        .listBlocks(me.id)
        .map((b) => ({ other: repo.findById(b.other_id), blockedAt: b.created_at }))
        .filter((b): b is { other: User; blockedAt: string } => Boolean(b.other))
        .map((b) => ({ ...toRef(b.other), blockedAt: b.blockedAt })),
    };

    for (const row of repo.listFriendships(me.id)) {
      const other = repo.findById(otherIdOf(row, me.id));
      if (!other) continue;

      if (row.status === "friends") {
        // ブロック中の相手は blocked にだけ出す。
        if (blockedIds.has(other.id)) continue;
        response.friends.push({
          ...toRef(other),
          friendsSince: row.friends_since ?? row.created_at,
          best: bestState(row, me.id),
        });
        continue;
      }

      const entry = { ...toRef(other), requestId: row.request_id ?? "", createdAt: row.created_at };
      if (row.requested_by === me.id) response.requests.outgoing.push(entry);
      else response.requests.incoming.push(entry);
    }

    return c.json(response);
  });

  /**
   * 「知り合いかも」。フレンドのフレンドから、
   *   ・ベストフレンドのフレンド
   *   ・共通のフレンドが2人以上
   *   ・フレンドがまだ1人だけなら、そのフレンドのフレンド全員
   * を返す。どちらの理由で出したかは返さず、共通のフレンドの名前だけを渡す
   * （申請するかどうかの手がかりになるのはそこなので）。
   */
  app.get("/v1/friends/suggestions", (c) => {
    const me = requireUser(c, repo);
    const suggestions: Suggestion[] = [];
    for (const row of repo.suggestions(me.id, SUGGESTION_LIMIT)) {
      const other = repo.findById(row.other_id);
      if (!other) continue;
      // 共通のフレンドは、どちらもこちらのフレンドなので名前を出してよい
      const mutual = String(row.via_ids ?? "")
        .split(",")
        .map((id) => repo.findById(Number(id)))
        .filter((u): u is User => Boolean(u))
        .map(toRef);
      suggestions.push({ ...toRef(other), mutual });
    }
    const response: SuggestionsResponse = { suggestions };
    return c.json(response);
  });

  /**
   * 招待リンク・QRの相手を調べる。申請はしない。
   * 招待リンクを開いた人に、申請する前に相手の名前を見せて確かめるため
   * （ストーリーズのQRなどは、知らない人の手にも渡るので、黙って申請しない）。
   * 相手にブロックされているときも、それが分からないよう none を返す（申請しても届かない）。
   */
  app.get("/v1/invites/:shareKey", (c) => {
    const me = requireUser(c, repo);
    const other = repo.findByShareKey(c.req.param("shareKey"));
    if (!other || other.onboarding_completed_at === null) fail(404, "share_key_not_found", "この招待の相手が見つかりません");
    if (other.id === me.id) fail(400, "self", "あなた自身の招待です");
    if (repo.isBlocking(me.id, other.id)) fail(409, "blocked_by_you", "ブロック中の相手です。先にブロックを解除してください");
    const row = repo.getFriendship(me.id, other.id);
    const relation: InviteResponse["relation"] = row?.status === "friends" ? "friends"
      : row?.status === "pending" ? (row.requested_by === me.id ? "requested" : "incoming")
      : "none";
    const response: InviteResponse = { user: toRef(other), relation };
    return c.json(response);
  });

  app.post("/v1/friends", async (c) => {
    const me = requireUser(c, repo);
    const body = await c.req.json().catch(() => null);
    // QRは対面での追加。リンク・共有キーは承認待ち。
    if (body?.via === "mac" || body?.mac !== undefined) fail(400, "unsupported_friend_method", "MACでのフレンド検索は終了しました");
    const via = body?.via === "qr" ? "qr" : "link";

    // 「知り合いかも」からは共有キーを渡せないので、userId で申請する（link と同じ承認待ち）。
    const other = body?.via === "suggestion"
      ? (typeof body?.userId === "string" ? repo.findByUserId(body.userId) : undefined)
      : (typeof body?.shareKey === "string" ? repo.findByShareKey(body.shareKey) : undefined);
    if (!other || other.onboarding_completed_at === null) {
      if (body?.via === "suggestion") fail(404, "user_not_found", "この相手は見つかりません");
      fail(404, "share_key_not_found", "この共有キーの相手が見つかりません");
    }
    if (other.id === me.id) fail(400, "self", "自分のキーです");
    if (repo.isBlocking(me.id, other.id)) {
      fail(409, "blocked_by_you", "ブロック中の相手です。先にブロックを解除してください");
    }

    const existing = repo.getFriendship(me.id, other.id);
    if (existing?.status === "friends") fail(409, "already_friends", "すでにフレンドです");

    // 相手にブロックされている場合は、それが分からないよう、
    // ふつうの申請と同じ 202 を返して申請は届けない。
    const blockedByThem = repo.isBlocking(other.id, me.id);
    const friends = (): Response => {
      const response: AddFriendResponse = { status: "friends", user: toRef(other) };
      return c.json(response, 201);
    };

    if (existing?.status === "pending") {
      // 相手からの申請が来ていれば、その場でフレンドにする。
      // 自分が出した申請が残っているときも、QRなら目の前にいるので、その場でフレンドにする
      // （この行を残したままにすると、相手の画面に「承認待ち」がいつまでも出てしまう）。
      if (existing.requested_by !== me.id || (via === "qr" && !blockedByThem)) {
        repo.acceptRequest(existing);
        return friends();
      }
      const response: AddFriendResponse = {
        status: "requested",
        requestId: existing.request_id ?? "",
        user: toRef(other),
      };
      return c.json(response, 202);
    }

    if (via === "qr" && !blockedByThem) {
      repo.createFriends(me.id, other.id);
      return friends();
    }

    const requestId = blockedByThem
      ? `fr_${"0".repeat(16)}`
      : (repo.createRequest(me.id, other.id).request_id ?? "");
    const response: AddFriendResponse = { status: "requested", requestId, user: toRef(other) };
    return c.json(response, 202);
  });

  app.post("/v1/friend-requests/:requestId/accept", (c) => {
    const me = requireUser(c, repo);
    const row = repo.getFriendshipByRequestId(c.req.param("requestId"));
    if (!row || row.status !== "pending" || row.requested_by === me.id) {
      fail(404, "request_not_found", "この申請は見つかりません");
    }
    const other = repo.findById(otherIdOf(row, me.id));
    if (!other || (row.user_low !== me.id && row.user_high !== me.id)) {
      fail(404, "request_not_found", "この申請は見つかりません");
    }
    repo.acceptRequest(row);
    return c.json({ status: "friends", user: toRef(other) });
  });

  app.post("/v1/friend-requests/:requestId/decline", (c) => {
    const me = requireUser(c, repo);
    const row = repo.getFriendshipByRequestId(c.req.param("requestId"));
    if (!row || row.status !== "pending" || (row.user_low !== me.id && row.user_high !== me.id)) {
      fail(404, "request_not_found", "この申請は見つかりません");
    }
    repo.deleteFriendship(row);
    return c.body(null, 204);
  });

  // ── ベストフレンド ────────────────────────────────────────
  app.post("/v1/friends/:userId/best", (c) => {
    const me = requireUser(c, repo);
    const other = repo.findByUserId(c.req.param("userId"));
    if (!other) fail(404, "user_not_found", "この相手は見つかりません");

    const row = repo.getFriendship(me.id, other.id);
    if (!row || row.status !== "friends") fail(404, "user_not_found", "この相手は見つかりません");
    if (repo.isBlocking(me.id, other.id) || repo.isBlocking(other.id, me.id)) {
      fail(409, "blocked", "ブロック中はベストフレンドにできません");
    }

    repo.setBest(row, me.id, true);
    const updated = repo.getFriendship(me.id, other.id) as FriendshipRow;
    const response: BestResponse = { userId: other.user_id, best: bestState(updated, me.id) };
    return c.json(response);
  });

  // 申請の取り消し・届いた申請を断る・ベストフレンドをやめる、すべてこれ。片方だけでできる。
  app.delete("/v1/friends/:userId/best", (c) => {
    const me = requireUser(c, repo);
    const other = repo.findByUserId(c.req.param("userId"));
    if (!other) fail(404, "user_not_found", "この相手は見つかりません");

    const row = repo.getFriendship(me.id, other.id);
    if (row) repo.clearBest(row);
    const response: BestResponse = { userId: other.user_id, best: "none" };
    return c.json(response);
  });

  // ── ブロック ──────────────────────────────────────────────
  app.post("/v1/friends/:userId/block", (c) => {
    const me = requireUser(c, repo);
    const other = repo.findByUserId(c.req.param("userId"));
    if (!other) fail(404, "user_not_found", "この相手は見つかりません");

    repo.addBlock(me.id, other.id);
    // ベストフレンドとその申請は解除する。フレンド関係そのものは消さない。
    const row = repo.getFriendship(me.id, other.id);
    if (row) repo.clearBest(row);

    const response: BlockResponse = { userId: other.user_id, blocked: true };
    return c.json(response);
  });

  app.delete("/v1/friends/:userId/block", (c) => {
    const me = requireUser(c, repo);
    const other = repo.findByUserId(c.req.param("userId"));
    if (!other) fail(404, "user_not_found", "この相手は見つかりません");

    repo.removeBlock(me.id, other.id);
    const response: BlockResponse = { userId: other.user_id, blocked: false };
    return c.json(response);
  });

  // ── スライムへのリアクション ─────────────────────────────
  /**
   * フレンドのスライムを連打した回数を送る。すぐには届けず、ためておく。
   * 相手がボタンを押して、こちらのスライムが相手の画面に出たときに届く（/v1/checks）。
   *
   * 相手にブロックされていても、ふつうと同じ 202 を返して黙って捨てる。
   */
  app.post("/v1/friends/:userId/reactions", async (c) => {
    const me = requireUser(c, repo);
    const other = friendTarget(repo, me, c.req.param("userId"));
    const count = (await c.req.json().catch(() => null))?.count;
    if (!Number.isInteger(count) || count < 1 || count > REACTION.MAX) {
      fail(400, "invalid_count", `回数は1〜${REACTION.MAX}で送ってください`);
    }

    if (!repo.isBlocking(other.id, me.id)) repo.addReaction(me.id, other.id, count as number, REACTION.MAX);
    const response: ReactionResponse = { userId: other.user_id, count: count as number };
    return c.json(response, 202);
  });

  // ── 問い合わせ・ご意見 ────────────────────────────────────
  /**
   * アプリの中から送ってもらう。DBに貯めるだけで、誰かに自動で届くことはない。
   * 読むときは backend/README.md の手順で取り出す。
   *
   * 悪意なく連投されても困るので、1日5件までにしてある。
   */
  app.post("/v1/feedback", async (c) => {
    const me = requireUser(c, repo);
    const raw = (await c.req.json().catch(() => null))?.message;
    const message = typeof raw === "string" ? raw.trim() : "";
    if (message.length < 2 || message.length > 1000) {
      fail(400, "invalid_message", "2〜1000文字で書いてください");
    }

    const today = jstDate();
    const sent = repo.feedbackCount(me.id, today);
    if (sent >= FEEDBACK_PER_DAY) {
      fail(429, "too_many", `今日はもう送れません（1日${FEEDBACK_PER_DAY}件まで）。明日またお願いします`);
    }

    repo.addFeedback(me.id, today, message);
    const response: FeedbackResponse = { remaining: FEEDBACK_PER_DAY - sent - 1 };
    return c.json(response, 201);
  });

  // ── 繋がらなかった呼び出しの報告 ──────────────────────────
  /**
   * fetch が投げた（返事まで届かなかった）呼び出しを、ブラウザが溜めておいて次に繋がったときに送る。
   * サーバーには何も届いていない失敗なので、こうしないと記録が残らない。
   *
   * ログイン前の失敗（開いた直後など）も知りたいので、ログインは求めない。
   * 書けるのは件数の決まった ops_events だけで、連投されても古いログが押し出されるだけ。
   */
  const routeMatchers = () =>
    app.routes
      .filter((r) => r.path.startsWith("/v1/") && !r.path.includes("*"))
      .map((r) => ({
        method: r.method,
        route: `/api${r.path}`,
        // ルートは英字・数字・"-"・"/" と :名前 だけなので、:名前 を1区切りに置き換えれば足りる
        re: new RegExp(`^${r.path.replace(/:[A-Za-z]+/g, "[^/]+")}$`),
      }));
  let matchers: ReturnType<typeof routeMatchers> | null = null;
  const routeOf = (method: string, path: string) => {
    matchers ??= routeMatchers();
    return (matchers.find((m) => m.method === method && m.re.test(path)) ?? matchers.find((m) => m.re.test(path)))?.route ?? null;
  };

  app.post("/v1/client-errors", bodyLimit({ maxSize: 16 * 1024, onError: () => fail(413, "too_large", "大きすぎます") }), async (c) => {
    const errors = (await c.req.json().catch(() => null))?.errors;
    if (!Array.isArray(errors)) fail(400, "invalid_errors", "errors を配列で送ってください");
    for (const e of (errors as unknown[]).slice(0, CLIENT_ERRORS_MAX)) {
      const ops = toClientOps(e, routeOf);
      if (ops) repo.recordOps(ops);
    }
    return c.body(null, 204);
  });

  // ── 管理用パスワード（/admin と /explain） ───────────────
  app.post("/v1/admin/login", async (c) => {
    if (!admin.enabled) fail(503, "admin_unavailable", "管理用パスワードが設定されていません");
    const ip = clientIp(c);
    if (admin.locked(ip)) fail(429, "too_many", "間違いが続いたため、しばらく入れません。15分ほど待ってください");
    const password = (await c.req.json().catch(() => null))?.password;
    if (typeof password !== "string" || !admin.check(password, ip)) {
      fail(401, "wrong_password", "パスワードが違います");
    }
    setCookie(c, adminCookie, admin.issue(), {
      ...cookieOptions, sameSite: "Strict", maxAge: Math.floor(admin.TTL_MS / 1000),
    });
    return c.body(null, 204);
  });

  app.post("/v1/admin/logout", (c) => {
    deleteCookie(c, adminCookie, cookieOptions);
    return c.body(null, 204);
  });

  app.get("/v1/admin/session", (c) => {
    const response: AdminSessionResponse = { admin: admin.verify(getCookie(c, adminCookie)) };
    return c.json(response);
  });

  app.get("/v1/admin/stats", (c) => {
    requireAdmin(c);
    const response: AdminStatsResponse = repo.adminStats();
    return c.json(response);
  });

  /** 管理画面のログ。5xx・遅い呼び出し・起動と、ブラウザから届いた「繋がらなかった」。 */
  app.get("/v1/admin/logs", (c) => {
    requireAdmin(c);
    const response: AdminLogsResponse = { events: repo.recentOps(), kept: OPS_KEEP };
    return c.json(response);
  });

  /** 管理画面のDB表。/debug/db に、メール・問い合わせ・アクセス数を足したもの。 */
  app.get("/v1/admin/db", (c) => {
    requireAdmin(c);
    const response: DebugDbResponse = { tables: repo.dump(true) };
    return c.json(response);
  });

  // ── 説明用 ────────────────────────────────────────────────
  /**
   * /explain のページが「バックエンドのDBに何が入っているか」を出すために叩く。
   * アプリ本体は使わない。
   *
   * テーブルを丸ごと・全員ぶん返すので、管理用パスワードで入った人にだけ見せる。
   * メール・認証情報・MAC原文・共有キーは伏せる。理由は repo.dump() のコメント。
   */
  app.get("/v1/debug/db", (c) => {
    requireAdmin(c);
    const response: DebugDbResponse = { tables: repo.dump() };
    return c.json(response);
  });

  return app;
}
