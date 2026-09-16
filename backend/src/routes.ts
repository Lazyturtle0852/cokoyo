import { Hono } from "hono";
import type {
  AddFriendResponse, BestResponse, BestState, BlockResponse, CheckResponse,
  DebugDbResponse, FriendsResponse, Me, PointItem, PointsResponse, RegisterResponse, UserRef,
} from "../../shared/app-types.js";
import { BUILDING_LABELS } from "../../shared/app-types.js";
import { config } from "./config.js";
import type { DtcClient, Lookup } from "./dtc.js";
import { fail } from "./lib/errors.js";
import { newDeviceToken } from "./lib/ids.js";
import { maskMac, normalizeMac } from "./lib/mac.js";
import { jstDate, sleep } from "./lib/time.js";
import { awardPoints, isRainy, type VisibleFriend } from "./points.js";
import type { FriendshipRow, Repo, User } from "./repo.js";

const buildingLabel = (lookup: Lookup): string | null =>
  lookup.status === "present" && lookup.buildingKey
    ? (BUILDING_LABELS[lookup.buildingKey] ?? null)
    : null;

const toRef = (u: User): UserRef => ({ userId: u.user_id, displayName: u.display_name });

const toMe = (u: User): Me => ({
  ...toRef(u),
  shareKey: u.share_key,
  hidden: u.hidden !== 0,
  macMasked: maskMac(u.mac),
  macRegisteredAt: u.mac_registered_at,
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

function requireUser(c: { req: { header: (n: string) => string | undefined } }, repo: Repo): User {
  const match = /^Bearer\s+(.+)$/i.exec((c.req.header("authorization") ?? "").trim());
  if (!match?.[1]) fail(401, "unauthorized", "登録が必要です");
  const user = repo.findByToken(match[1]);
  if (!user) fail(401, "unauthorized", "登録が必要です");
  return user;
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

/** /v1 の下に生やす。フロントは apiBaseUrl + "/v1/..." で叩く。 */
export function createRoutes(repo: Repo, dtc: DtcClient) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, mock_dtc: config.mockDtc }));

  // ── 登録・自分 ────────────────────────────────────────────
  app.post("/v1/users", async (c) => {
    const body = await c.req.json().catch(() => null);
    const displayName = validName(body?.displayName);
    const mac = validMac(body?.mac);

    if (repo.findByMac(mac)) {
      fail(409, "mac_taken", "このMACアドレスはすでに登録されています");
    }

    const deviceToken = newDeviceToken();
    const user = repo.createUser(displayName, mac, deviceToken);
    const response: RegisterResponse = { ...toMe(user), deviceToken };
    return c.json(response, 201);
  });

  /**
   * 登録済みのMACを、この端末に引き継ぐ。
   *
   * アプリを入れ直すと端末トークンが消え、同じMACでは mac_taken になって
   * 二度と入れなくなるため、その退路。
   *
   * MACの持ち主であることは確かめられないが、それは登録そのものも同じで
   * （手入力なので他人のMACでも登録できる）、ここだけ厳しくしても意味がない。
   * 当面は仲間内の試用に限る、という前提を共有した上での割り切り。
   */
  app.post("/v1/sessions", async (c) => {
    const mac = validMac((await c.req.json().catch(() => null))?.mac);

    const user = repo.findByMac(mac);
    if (!user) fail(404, "mac_not_registered", "このMACアドレスはまだ登録されていません");

    // 前の端末は使えなくなる。乗っ取られたときに気づけるよう、黙って両方は生かさない。
    const deviceToken = newDeviceToken();
    repo.rotateToken(user.id, deviceToken);

    const response: RegisterResponse = { ...toMe(user), deviceToken };
    return c.json(response);
  });

  app.get("/v1/me", (c) => c.json(toMe(requireUser(c, repo))));

  app.patch("/v1/me", async (c) => {
    const me = requireUser(c, repo);
    const body = await c.req.json().catch(() => null);

    const displayName = body?.displayName === undefined
      ? me.display_name
      : validName(body.displayName);
    if (body?.hidden !== undefined && typeof body.hidden !== "boolean") {
      fail(400, "invalid_hidden", "かくれんぼの設定が正しくありません");
    }
    const hidden = body?.hidden === undefined ? me.hidden !== 0 : (body.hidden as boolean);

    repo.updateProfile(me.id, displayName, hidden);
    return c.json(toMe(repo.findById(me.id) as User));
  });

  app.put("/v1/me/mac", async (c) => {
    const me = requireUser(c, repo);
    const mac = validMac((await c.req.json().catch(() => null))?.mac);

    const owner = repo.findByMac(mac);
    if (owner && owner.id !== me.id) {
      fail(409, "mac_taken", "このMACアドレスはすでに登録されています");
    }

    repo.updateMac(me.id, mac);
    return c.json(toMe(repo.findById(me.id) as User));
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

    const [mine, ...theirs] = await Promise.all([
      dtc.latest(me.mac),
      ...friends.map(async (f) => {
        // WiFiに繋がっていない・かくれんぼ中・相手が自分をブロック中は、
        // すべて同じ「いない」にする。理由は区別しない。
        if (f.other.hidden !== 0 || repo.isBlocking(f.other.id, me.id)) {
          return { status: "absent" } as Lookup;
        }
        return dtc.latest(f.other.mac);
      }),
    ]);

    const condition = (await dtc.weather()) ?? "unknown";
    const rainy = isRainy(condition === "unknown" ? null : condition);

    const visible: VisibleFriend[] = friends.map((f, i) => ({
      user: f.other,
      present: theirs[i]?.status === "present",
    }));

    const today = jstDate();
    const { awarded, notice } = awardPoints(repo, me, {
      present: mine?.status === "present",
      rainy,
      friends: visible,
      today,
    });

    const response: CheckResponse = {
      checkedAt: new Date().toISOString(),
      me: {
        present: mine?.status === "present",
        // かくれんぼ中でも、本人には本当のことを返す。
        building: mine ? buildingLabel(mine) : null,
        hidden: me.hidden !== 0,
      },
      weather: { condition, rainy },
      friends: friends.map((f, i) => {
        const lookup = theirs[i];
        const present = lookup?.status === "present";
        // 建物を出すのはベストフレンド同士のときだけ。
        const label = present && bestState(f.row, me.id) === "best" && lookup
          ? buildingLabel(lookup)
          : null;
        return {
          userId: f.other.user_id,
          present,
          ...(label ? { building: label } : {}),
        };
      }),
      points: { awarded, notice, ...pointsView(repo, me) },
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

  app.post("/v1/friends", async (c) => {
    const me = requireUser(c, repo);
    const body = await c.req.json().catch(() => null);
    // qr は即フレンド。link と mac は相手の承認待ち（どちらも相手が居ない場で渡された値なので）。
    const via = body?.via === "qr" ? "qr" : body?.via === "mac" ? "mac" : "link";

    const other = via === "mac"
      ? repo.findByMac(validMac(body?.mac))
      : typeof body?.shareKey === "string"
        ? repo.findByShareKey(body.shareKey)
        : undefined;
    if (!other) {
      if (via === "mac") fail(404, "mac_not_registered", "このMACアドレスの人は、まだ登録していません");
      fail(404, "share_key_not_found", "この共有キーの相手が見つかりません");
    }
    if (other.id === me.id) fail(400, "self", via === "mac" ? "自分のMACアドレスです" : "自分のキーです");
    if (repo.isBlocking(me.id, other.id)) {
      fail(409, "blocked_by_you", "ブロック中の相手です。先にブロックを解除してください");
    }

    const existing = repo.getFriendship(me.id, other.id);
    if (existing?.status === "friends") fail(409, "already_friends", "すでにフレンドです");

    // 相手からの申請が来ていれば、その場でフレンドにする。
    if (existing?.status === "pending" && existing.requested_by !== me.id) {
      repo.acceptRequest(existing);
      const response: AddFriendResponse = { status: "friends", user: toRef(other) };
      return c.json(response, 201);
    }

    // 相手にブロックされている場合は、それが分からないよう、
    // ふつうの申請と同じ 202 を返して申請は届けない。
    const blockedByThem = repo.isBlocking(other.id, me.id);

    if (via === "qr" && !blockedByThem) {
      repo.createFriends(me.id, other.id);
      const response: AddFriendResponse = { status: "friends", user: toRef(other) };
      return c.json(response, 201);
    }

    if (existing?.requested_by === me.id) {
      const response: AddFriendResponse = {
        status: "requested",
        requestId: existing.request_id ?? "",
        user: toRef(other),
      };
      return c.json(response, 202);
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

  // ── 説明用 ────────────────────────────────────────────────
  /**
   * /explain のページが「バックエンドのDBに何が入っているか」を出すために叩く。
   * アプリ本体は使わない。返すのは呼んだ本人に関係する行だけ。
   */
  app.get("/v1/debug/db", (c) => {
    const me = requireUser(c, repo);
    const response: DebugDbResponse = { tables: repo.dump(me.id) };
    return c.json(response);
  });

  return app;
}
