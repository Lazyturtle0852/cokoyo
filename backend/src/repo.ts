import type { AdminStatsResponse, DbTable, OpsEvent } from "../../shared/app-types.js";
import type { Db } from "./db.js";
import { hashToken, newRequestId, newShareKey, newUserId } from "./lib/ids.js";
import { maskMac } from "./lib/mac.js";
import { jstDate, shiftDate } from "./lib/time.js";

/** 運用ログに書く1件。at を省くと今の時刻 */
export interface OpsInput {
  source: OpsEvent["source"];
  kind: OpsEvent["kind"];
  at?: string;
  method?: string | null;
  route?: string | null;
  status?: number | null;
  ms?: number | null;
  online?: boolean | null;
  visible?: boolean | null;
  sinceLoad?: number | null;
  message?: string | null;
}

/** 運用ログ（ops_events）に残す件数。超えたら古いものから消す */
export const OPS_KEEP = 5000;

export interface User {
  id: number;
  user_id: string;
  google_sub: string;
  email: string;
  display_name: string | null;
  avatar: string | null;
  avatar_source: "unset" | "google" | "custom" | "disabled";
  share_key: string | null;
  hidden: number;
  discoverable: number;
  onboarding_completed_at: string | null;
}

export interface MacAddress {
  id: number;
  user_id: number;
  mac: string;
  label: string;
  registered_at: string;
}

export interface FriendshipRow {
  id: number;
  user_low: number;
  user_high: number;
  status: "pending" | "friends";
  requested_by: number | null;
  request_id: string | null;
  best_low: number;
  best_high: number;
  created_at: string;
  friends_since: string | null;
}

export interface PointRow {
  kind: string;
  label: string;
  pts: number;
  other_user_id: number | null;
  days: number | null;
}

const USER_COLS =
  "id, user_id, google_sub, email, display_name, avatar, avatar_source, share_key, hidden, onboarding_completed_at, discoverable";

/** 常に (小さい方, 大きい方) の順に揃える。 */
const pair = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

export function createRepo(db: Db) {
  const one = <T>(row: unknown): T | undefined => (row ? ({ ...(row as T) } as T) : undefined);
  const many = <T>(rows: unknown[]): T[] => rows.map((r) => ({ ...(r as T) }) as T);

  const q = {
    userById: db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`),
    userByUserId: db.prepare(`SELECT ${USER_COLS} FROM users WHERE user_id = ?`),
    userByShareKey: db.prepare(`SELECT ${USER_COLS} FROM users WHERE share_key = ?`),
    userBySub: db.prepare(`SELECT ${USER_COLS} FROM users WHERE google_sub = ?`),
    userByEmail: db.prepare(`SELECT ${USER_COLS} FROM users WHERE email = ?`),
    insertUser: db.prepare("INSERT INTO users (user_id, google_sub, email, created_at) VALUES (?, ?, ?, ?)"),
    updateEmail: db.prepare("UPDATE users SET email = ? WHERE id = ?"),
    completeUser: db.prepare("UPDATE users SET display_name = ?, share_key = ?, onboarding_completed_at = ? WHERE id = ?"),
    updateProfile: db.prepare("UPDATE users SET display_name = ?, hidden = ?, discoverable = ? WHERE id = ?"),
    updateAvatar: db.prepare("UPDATE users SET avatar = ?, avatar_source = ? WHERE id = ?"),
    setGoogleName: db.prepare("UPDATE users SET display_name = ? WHERE id = ? AND display_name IS NULL AND onboarding_completed_at IS NULL"),
    setGoogleAvatar: db.prepare("UPDATE users SET avatar = ?, avatar_source = 'google' WHERE id = ? AND avatar_source = 'unset'"),
    macsOf: db.prepare("SELECT id, user_id, mac, label, registered_at FROM mac_addresses WHERE user_id = ? ORDER BY id"),
    macById: db.prepare("SELECT id, user_id, mac, label, registered_at FROM mac_addresses WHERE id = ?"),
    userByMac: db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = (SELECT user_id FROM mac_addresses WHERE mac = ?)`),
    insertMac: db.prepare("INSERT INTO mac_addresses (user_id, mac, label, registered_at) VALUES (?, ?, ?, ?)"),
    updateMac: db.prepare("UPDATE mac_addresses SET mac = ?, label = ?, registered_at = ? WHERE id = ? AND user_id = ?"),
    deleteMac: db.prepare("DELETE FROM mac_addresses WHERE id = ? AND user_id = ?"),
    insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"),
    userByToken: db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = (SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?)`),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    deleteSessionsOf: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
    pruneSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
    insertFlow: db.prepare("INSERT INTO auth_flows (state_hash, code_verifier, nonce, return_to, expires_at) VALUES (?, ?, ?, ?, ?)"),
    flow: db.prepare("SELECT code_verifier, nonce, return_to, expires_at FROM auth_flows WHERE state_hash = ?"),
    deleteFlow: db.prepare("DELETE FROM auth_flows WHERE state_hash = ?"),
    pruneFlows: db.prepare("DELETE FROM auth_flows WHERE expires_at <= ?"),

    friendship: db.prepare(
      "SELECT * FROM friendships WHERE user_low = ? AND user_high = ?",
    ),
    friendshipByRequestId: db.prepare("SELECT * FROM friendships WHERE request_id = ?"),
    friendshipsOf: db.prepare(
      "SELECT * FROM friendships WHERE user_low = ? OR user_high = ? ORDER BY id",
    ),
    insertFriendship: db.prepare(
      `INSERT INTO friendships (user_low, user_high, status, requested_by, request_id,
                                created_at, friends_since)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    promoteFriendship: db.prepare(
      `UPDATE friendships SET status = 'friends', requested_by = NULL, request_id = NULL,
                              friends_since = ? WHERE id = ?`,
    ),
    deleteFriendship: db.prepare("DELETE FROM friendships WHERE id = ?"),
    setBest: db.prepare("UPDATE friendships SET best_low = ?, best_high = ? WHERE id = ?"),

    /**
     * 「知り合いかも」。フレンドのフレンドを集めて、
     *   ・共通のフレンドが2人以上
     *   ・ベストフレンド（お互いに立てている相手）のフレンド
     *   ・フレンドがまだ1人だけなら、そのフレンドのフレンド全員
     *     （はじめたばかりの人は「共通2人以上」が出ようがないため）
     * のどれかに当てはまる人を返す。
     *
     * すでにフレンド・申請中（どちらの向きも）・ブロックしている／されている相手、
     * 「おすすめに出さない」にしている人、登録の途中の人は外す。
     */
    suggestions: db.prepare(`
      WITH mine AS (
        SELECT CASE WHEN user_low = ?1 THEN user_high ELSE user_low END AS fid,
               (best_low = 1 AND best_high = 1) AS is_best
        FROM friendships
        WHERE status = 'friends' AND (user_low = ?1 OR user_high = ?1)
      ),
      foaf AS (
        SELECT CASE WHEN g.user_low = m.fid THEN g.user_high ELSE g.user_low END AS other,
               m.fid AS via, m.is_best AS via_best
        FROM mine m
        JOIN friendships g
          ON g.status = 'friends' AND (g.user_low = m.fid OR g.user_high = m.fid)
      )
      SELECT f.other AS other_id,
             COUNT(*) AS mutual,
             MAX(f.via_best) AS has_best,
             GROUP_CONCAT(f.via) AS via_ids
      FROM foaf f
      JOIN users u ON u.id = f.other
      WHERE f.other <> ?1
        AND u.onboarding_completed_at IS NOT NULL
        AND u.discoverable = 1
        AND NOT EXISTS (
          SELECT 1 FROM friendships r
          WHERE (r.user_low = ?1 AND r.user_high = f.other) OR (r.user_low = f.other AND r.user_high = ?1)
        )
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = ?1 AND b.blocked_id = f.other)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = f.other AND b.blocked_id = ?1)
      GROUP BY f.other
      HAVING mutual >= 2 OR has_best = 1 OR (SELECT COUNT(*) FROM mine) = 1
      ORDER BY has_best DESC, mutual DESC, f.other
      LIMIT ?2
    `),

    block: db.prepare("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?"),
    insertBlock: db.prepare(
      "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)",
    ),
    deleteBlock: db.prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?"),
    blocksBy: db.prepare(
      `SELECT b.blocked_id AS other_id, b.created_at
       FROM blocks b WHERE b.blocker_id = ? ORDER BY b.created_at`,
    ),

    insertPoint: db.prepare(
      `INSERT INTO point_events (user_id, date, kind, label, pts, other_user_id, days, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    pointsOfDay: db.prepare(
      `SELECT kind, label, pts, other_user_id, days FROM point_events
       WHERE user_id = ? AND date = ? ORDER BY id`,
    ),
    pointsTotal: db.prepare(
      "SELECT COALESCE(SUM(pts), 0) AS total FROM point_events WHERE user_id = ?",
    ),

    feedbackCount: db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND date = ?"),
    insertFeedback: db.prepare(
      "INSERT INTO feedback (user_id, date, message, created_at) VALUES (?, ?, ?, ?)",
    ),

    addReaction: db.prepare(
      `INSERT INTO reactions (from_id, to_id, count, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(from_id, to_id) DO UPDATE SET
         count = MIN(reactions.count + excluded.count, ?), updated_at = excluded.updated_at`,
    ),
    reaction: db.prepare("SELECT count, updated_at FROM reactions WHERE from_id = ? AND to_id = ?"),
    deleteReaction: db.prepare("DELETE FROM reactions WHERE from_id = ? AND to_id = ?"),

    visit: db.prepare("SELECT 1 FROM visits WHERE user_id = ? AND date = ?"),
    insertVisit: db.prepare("INSERT OR IGNORE INTO visits (user_id, date) VALUES (?, ?)"),

    match: db.prepare(
      "SELECT last_date FROM matches WHERE user_id = ? AND other_user_id = ?",
    ),
    upsertMatch: db.prepare(
      `INSERT INTO matches (user_id, other_user_id, last_date) VALUES (?, ?, ?)
       ON CONFLICT(user_id, other_user_id) DO UPDATE SET last_date = excluded.last_date`,
    ),
  };

  // アクセス数。1日・1人ごと、1日・1ルートごとに足し込むだけにして、行が増えすぎないようにする。
  const accessQ = {
    byUser: db.prepare(
      `INSERT INTO access_daily (date, user_id, hits) VALUES (?, ?, 1)
       ON CONFLICT(date, user_id) DO UPDATE SET hits = hits + 1`,
    ),
    byRoute: db.prepare(
      `INSERT INTO access_routes (date, method, route, hits) VALUES (?, ?, ?, 1)
       ON CONFLICT(date, method, route) DO UPDATE SET hits = hits + 1`,
    ),
  };

  // 運用ログ。行が増え続けないよう、書くたびに OPS_KEEP 件より古いものを消す。
  const opsQ = {
    insert: db.prepare(
      `INSERT INTO ops_events
         (at, reported_at, source, kind, method, route, status, ms, online, visible, since_load_ms, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    trim: db.prepare("DELETE FROM ops_events WHERE id <= (SELECT MAX(id) FROM ops_events) - ?"),
    recent: db.prepare("SELECT * FROM ops_events ORDER BY at DESC, id DESC LIMIT ?"),
  };

  // 管理画面の集計。users.created_at は UTC の ISO なので、日本時間の日付に直して数える。
  const statsQ = {
    totals: db.prepare(`SELECT
      (SELECT COUNT(*) FROM users WHERE onboarding_completed_at IS NOT NULL) AS users,
      (SELECT COUNT(*) FROM users WHERE onboarding_completed_at IS NULL) AS onboarding,
      (SELECT COUNT(*) FROM users WHERE hidden = 1) AS hidden,
      (SELECT COUNT(*) FROM mac_addresses) AS macs,
      (SELECT COUNT(*) FROM friendships WHERE status = 'friends') AS friendships,
      (SELECT COUNT(*) FROM friendships WHERE status = 'friends' AND best_low = 1 AND best_high = 1) AS bestFriends,
      (SELECT COUNT(*) FROM friendships WHERE status = 'pending') AS pendingRequests,
      (SELECT COUNT(*) FROM blocks) AS blocks,
      (SELECT COUNT(*) FROM feedback) AS feedback,
      (SELECT COALESCE(SUM(pts), 0) FROM point_events) AS points`),
    activeSince: db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM access_daily WHERE user_id > 0 AND date >= ?"),
    signups: db.prepare(
      `SELECT date(created_at, '+9 hours') AS date, COUNT(*) AS n FROM users
       WHERE date(created_at, '+9 hours') >= ? GROUP BY 1`,
    ),
    access: db.prepare(
      `SELECT date, SUM(CASE WHEN user_id > 0 THEN 1 ELSE 0 END) AS users,
              SUM(hits) AS hits, SUM(CASE WHEN user_id = 0 THEN hits ELSE 0 END) AS anon
       FROM access_daily WHERE date >= ? GROUP BY date`,
    ),
    visits: db.prepare("SELECT date, COUNT(*) AS n FROM visits WHERE date >= ? GROUP BY date"),
    routes: db.prepare(
      `SELECT method, route, SUM(hits) AS hits FROM access_routes
       WHERE date >= ? GROUP BY method, route ORDER BY hits DESC`,
    ),
    users: db.prepare(`SELECT u.user_id, u.display_name, u.email, u.created_at,
        u.onboarding_completed_at IS NOT NULL AS onboarded, u.hidden,
        (SELECT COUNT(*) FROM mac_addresses m WHERE m.user_id = u.id) AS macs,
        (SELECT COUNT(*) FROM friendships f WHERE f.status = 'friends' AND u.id IN (f.user_low, f.user_high)) AS friends,
        (SELECT COALESCE(SUM(pts), 0) FROM point_events p WHERE p.user_id = u.id) AS points,
        (SELECT COUNT(*) FROM visits v WHERE v.user_id = u.id) AS visitDays,
        (SELECT MAX(date) FROM access_daily a WHERE a.user_id = u.id) AS lastSeen,
        (SELECT COALESCE(SUM(hits), 0) FROM access_daily a WHERE a.user_id = u.id AND a.date >= ?) AS recentHits
      FROM users u ORDER BY u.id`),
    feedback: db.prepare(`SELECT f.id, f.created_at, u.user_id, u.display_name, u.email, f.message
      FROM feedback f JOIN users u ON u.id = f.user_id ORDER BY f.id DESC`),
  };

  // /explain で中身を見せるためのもの。アプリ本体は使わない。
  // テーブルの全行を出す。秘密の列は dump() で除外する。
  const dumpQ = {
    users: db.prepare("SELECT * FROM users ORDER BY id"),
    macs: db.prepare("SELECT * FROM mac_addresses ORDER BY id"),
    friendships: db.prepare("SELECT * FROM friendships ORDER BY id"),
    blocks: db.prepare("SELECT * FROM blocks ORDER BY created_at"),
    points: db.prepare("SELECT * FROM point_events ORDER BY id"),
    visits: db.prepare("SELECT * FROM visits ORDER BY date DESC, user_id"),
    matches: db.prepare("SELECT * FROM matches ORDER BY user_id, other_user_id"),
    reactions: db.prepare("SELECT * FROM reactions ORDER BY updated_at"),
    feedback: db.prepare("SELECT * FROM feedback ORDER BY id DESC"),
    accessDaily: db.prepare("SELECT * FROM access_daily ORDER BY date DESC, hits DESC"),
    accessRoutes: db.prepare("SELECT * FROM access_routes ORDER BY date DESC, hits DESC"),
  };

  type Cell = string | number | null;
  const cells = (row: Record<string, unknown>, columns: string[]): Cell[] =>
    columns.map((c) => {
      const v = row[c];
      return typeof v === "string" || typeof v === "number" || v === null ? (v as Cell) : String(v);
    });

  return {
    // ── users ────────────────────────────────────────────────
    findById: (id: number) => one<User>(q.userById.get(id)),
    findByUserId: (userId: string) => one<User>(q.userByUserId.get(userId)),
    findByShareKey: (shareKey: string) => one<User>(q.userByShareKey.get(shareKey)),
    findByMac: (mac: string) => one<User>(q.userByMac.get(mac)),
    findBySub: (sub: string) => one<User>(q.userBySub.get(sub)),
    findByEmail: (email: string) => one<User>(q.userByEmail.get(email)),
    findByToken: (token: string) => one<User>(q.userByToken.get(hashToken(token), new Date().toISOString())),

    findOrCreateGoogleUser(sub: string, email: string): User {
      const existing = one<User>(q.userBySub.get(sub));
      if (existing) {
        if (existing.email !== email) q.updateEmail.run(email, existing.id);
        return one<User>(q.userBySub.get(sub)) as User;
      }
      const now = new Date().toISOString();
      q.insertUser.run(newUserId(), sub, email, now);
      const user = one<User>(q.userBySub.get(sub));
      if (!user) throw new Error("failed to persist user");
      return user;
    },

    completeUser(id: number, displayName: string, mac: string, label: string): User {
      db.exec("BEGIN IMMEDIATE");
      try {
        const now = new Date().toISOString();
        q.insertMac.run(id, mac, label, now);
        q.completeUser.run(displayName, newShareKey(), now, id);
        db.exec("COMMIT");
        return one<User>(q.userById.get(id)) as User;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },

    listMacs: (id: number) => many<MacAddress>(q.macsOf.all(id)),
    getMac: (id: number) => one<MacAddress>(q.macById.get(id)),
    addMac(userId: number, mac: string, label: string): MacAddress {
      db.exec("BEGIN IMMEDIATE");
      try {
        if (q.macsOf.all(userId).length >= 5) throw new Error("mac_limit");
        const result = q.insertMac.run(userId, mac, label, new Date().toISOString());
        db.exec("COMMIT");
        return one<MacAddress>(q.macById.get(result.lastInsertRowid)) as MacAddress;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    editMac(userId: number, id: number, mac: string, label: string): MacAddress {
      const old = one<MacAddress>(q.macById.get(id));
      q.updateMac.run(mac, label, old?.mac === mac ? old.registered_at : new Date().toISOString(), id, userId);
      return one<MacAddress>(q.macById.get(id)) as MacAddress;
    },
    removeMac(userId: number, id: number): void {
      db.exec("BEGIN IMMEDIATE");
      try {
        if (q.macsOf.all(userId).length <= 1) throw new Error("last_mac");
        q.deleteMac.run(id, userId);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    createSession(userId: number, token: string): void {
      const now = new Date();
      q.pruneSessions.run(now.toISOString());
      q.insertSession.run(hashToken(token), userId, now.toISOString(), new Date(now.getTime() + 14 * 86400000).toISOString());
    },
    deleteSession: (token: string) => void q.deleteSession.run(hashToken(token)),
    deleteSessionsOf: (userId: number) => void q.deleteSessionsOf.run(userId),
    createFlow(state: string, verifier: string, nonce: string, returnTo: string): void {
      q.pruneFlows.run(new Date().toISOString());
      q.insertFlow.run(hashToken(state), verifier, nonce, returnTo, new Date(Date.now() + 10 * 60000).toISOString());
    },
    consumeFlow(state: string): { code_verifier: string; nonce: string; return_to: string } | null {
      const key = hashToken(state);
      const flow = one<{ code_verifier: string; nonce: string; return_to: string; expires_at: string }>(q.flow.get(key));
      q.deleteFlow.run(key);
      return flow && flow.expires_at > new Date().toISOString() ? flow : null;
    },

    updateProfile(id: number, displayName: string, hidden: boolean, discoverable: boolean): void {
      q.updateProfile.run(displayName, hidden ? 1 : 0, discoverable ? 1 : 0, id);
    },
    updateAvatar: (id: number, avatar: string | null) =>
      void q.updateAvatar.run(avatar, avatar ? "custom" : "disabled", id),
    setGoogleNameIfUnset: (id: number, name: string) => void q.setGoogleName.run(name, id),
    setGoogleAvatarIfUnset: (id: number, avatar: string) => void q.setGoogleAvatar.run(avatar, id),

    transaction<T>(fn: () => T): T {
      db.exec("BEGIN IMMEDIATE");
      try { const result = fn(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },

    // ── friendships ──────────────────────────────────────────
    getFriendship(a: number, b: number): FriendshipRow | undefined {
      const [low, high] = pair(a, b);
      return one<FriendshipRow>(q.friendship.get(low, high));
    },
    getFriendshipByRequestId: (requestId: string) =>
      one<FriendshipRow>(q.friendshipByRequestId.get(requestId)),

    listFriendships: (me: number) => many<FriendshipRow>(q.friendshipsOf.all(me, me)),

    /** すぐにフレンドにする（QRで直接会った場合）。 */
    createFriends(a: number, b: number): FriendshipRow {
      const [low, high] = pair(a, b);
      const now = new Date().toISOString();
      q.insertFriendship.run(low, high, "friends", null, null, now, now);
      return one<FriendshipRow>(q.friendship.get(low, high)) as FriendshipRow;
    },

    /** 承認待ちの申請を作る（リンク・キー入力の場合）。 */
    createRequest(from: number, to: number): FriendshipRow {
      const [low, high] = pair(from, to);
      const now = new Date().toISOString();
      q.insertFriendship.run(low, high, "pending", from, newRequestId(), now, null);
      return one<FriendshipRow>(q.friendship.get(low, high)) as FriendshipRow;
    },

    acceptRequest(row: FriendshipRow): void {
      q.promoteFriendship.run(new Date().toISOString(), row.id);
    },
    deleteFriendship: (row: FriendshipRow) => void q.deleteFriendship.run(row.id),

    /** best は片側ずつ持つ。両方立っていればベストフレンド成立。 */
    setBest(row: FriendshipRow, me: number, value: boolean): void {
      const mine = me === row.user_low;
      q.setBest.run(
        mine ? (value ? 1 : 0) : row.best_low,
        mine ? row.best_high : value ? 1 : 0,
        row.id,
      );
    },
    clearBest: (row: FriendshipRow) => void q.setBest.run(0, 0, row.id),

    // ── blocks ───────────────────────────────────────────────
    /** 「知り合いかも」。ベストフレンドとつながっている人・共通の多い人が先 */
    suggestions: (me: number, limit: number) =>
      many<{ other_id: number; mutual: number; has_best: number; via_ids: string }>(
        q.suggestions.all(me, limit),
      ),

    isBlocking: (blocker: number, blocked: number) => Boolean(q.block.get(blocker, blocked)),
    addBlock: (blocker: number, blocked: number) =>
      void q.insertBlock.run(blocker, blocked, new Date().toISOString()),
    removeBlock: (blocker: number, blocked: number) => void q.deleteBlock.run(blocker, blocked),
    listBlocks: (me: number) =>
      many<{ other_id: number; created_at: string }>(q.blocksBy.all(me)),

    // ── points ───────────────────────────────────────────────
    addPoint(
      userId: number, date: string, kind: string, label: string, pts: number,
      otherUserId: number | null, days: number | null,
    ): void {
      q.insertPoint.run(userId, date, kind, label, pts, otherUserId, days, new Date().toISOString());
    },
    pointsOfDay: (userId: number, date: string) =>
      many<PointRow>(q.pointsOfDay.all(userId, date)),
    pointsTotal: (userId: number) =>
      Number((one<{ total: number }>(q.pointsTotal.get(userId)) ?? { total: 0 }).total),

    // ── feedback ─────────────────────────────────────────────
    /** その日に何件送ったか（送りすぎを止めるため） */
    feedbackCount: (userId: number, date: string) =>
      Number((one<{ n: number }>(q.feedbackCount.get(userId, date)) ?? { n: 0 }).n),
    addFeedback: (userId: number, date: string, message: string) =>
      void q.insertFeedback.run(userId, date, message, new Date().toISOString()),

    // ── reactions ────────────────────────────────────────────
    addReaction(from: number, to: number, count: number, max: number): void {
      q.addReaction.run(from, to, count, new Date().toISOString(), max);
    },
    /** 届いていないリアクションを受け取って消す。無ければ null。 */
    takeReaction(from: number, to: number): { count: number; updated_at: string } | null {
      const row = one<{ count: number; updated_at: string }>(q.reaction.get(from, to));
      if (row) q.deleteReaction.run(from, to);
      return row ?? null;
    },

    hasVisited: (userId: number, date: string) => Boolean(q.visit.get(userId, date)),
    recordVisit: (userId: number, date: string) => void q.insertVisit.run(userId, date),

    lastMatchDate(userId: number, otherId: number): string | null {
      const row = one<{ last_date: string }>(q.match.get(userId, otherId));
      return row?.last_date ?? null;
    },
    recordMatch: (userId: number, otherId: number, date: string) =>
      void q.upsertMatch.run(userId, otherId, date),

    // ── アクセス数と管理画面 ─────────────────────────────────
    /** API への呼び出しを1件数える。userId はログインしていなければ 0。 */
    recordAccess(date: string, userId: number, method: string, route: string): void {
      accessQ.byUser.run(date, userId);
      accessQ.byRoute.run(date, method, route);
    },

    /** 運用ログを1件書く。 */
    recordOps(e: OpsInput): void {
      const now = new Date().toISOString();
      const flag = (v: boolean | null | undefined) => (v == null ? null : v ? 1 : 0);
      opsQ.insert.run(
        e.at ?? now, now, e.source, e.kind, e.method ?? null, e.route ?? null, e.status ?? null, e.ms ?? null,
        flag(e.online), flag(e.visible), e.sinceLoad ?? null, e.message ?? null,
      );
      opsQ.trim.run(OPS_KEEP);
    },

    /** 運用ログ。起きた時刻の新しい順 */
    recentOps(limit = 500): OpsEvent[] {
      const n = (v: unknown) => (v === null ? null : Number(v));
      const b = (v: unknown) => (v === null ? null : Number(v) === 1);
      const str = (v: unknown) => (v === null ? null : String(v));
      return (opsQ.recent.all(limit) as Array<Record<string, unknown>>).map((r) => ({
        id: Number(r.id),
        at: String(r.at),
        reportedAt: String(r.reported_at),
        source: r.source as OpsEvent["source"],
        kind: r.kind as OpsEvent["kind"],
        method: str(r.method),
        route: str(r.route),
        status: n(r.status),
        ms: n(r.ms),
        online: b(r.online),
        visible: b(r.visible),
        sinceLoad: n(r.since_load_ms),
        message: str(r.message),
      }));
    },

    /** 管理画面の数字。daily は今日を含む直近 days 日。 */
    adminStats(days = 30): AdminStatsResponse {
      const today = jstDate();
      const from = shiftDate(today, -(days - 1));
      const num = (v: unknown) => Number(v ?? 0);
      const byDate = (rows: unknown[]) =>
        new Map((rows as Array<Record<string, unknown>>).map((r) => [String(r.date), r]));
      const signups = byDate(statsQ.signups.all(from));
      const access = byDate(statsQ.access.all(from));
      const visits = byDate(statsQ.visits.all(from));
      const totals = statsQ.totals.get() as Record<string, unknown>;
      const active = (since: string) => num((statsQ.activeSince.get(since) as { n: number }).n);

      return {
        generatedAt: new Date().toISOString(),
        today,
        totals: {
          users: num(totals.users), onboarding: num(totals.onboarding), hidden: num(totals.hidden),
          macs: num(totals.macs), friendships: num(totals.friendships), bestFriends: num(totals.bestFriends),
          pendingRequests: num(totals.pendingRequests), blocks: num(totals.blocks),
          feedback: num(totals.feedback), points: num(totals.points),
        },
        active: { today: active(today), week: active(shiftDate(today, -6)), month: active(from) },
        daily: Array.from({ length: days }, (_, i) => {
          const date = shiftDate(from, i);
          const a = access.get(date);
          return {
            date,
            signups: num(signups.get(date)?.n),
            activeUsers: num(a?.users),
            hits: num(a?.hits),
            anonHits: num(a?.anon),
            visitors: num(visits.get(date)?.n),
          };
        }),
        routes: (statsQ.routes.all(shiftDate(today, -6)) as Array<Record<string, unknown>>).map((r) => ({
          method: String(r.method), route: String(r.route), hits: num(r.hits),
        })),
        users: (statsQ.users.all(from) as Array<Record<string, unknown>>).map((r) => ({
          userId: String(r.user_id),
          displayName: r.display_name === null ? "" : String(r.display_name),
          email: String(r.email),
          createdAt: String(r.created_at),
          onboarded: num(r.onboarded) === 1,
          hidden: num(r.hidden) === 1,
          macs: num(r.macs),
          friends: num(r.friends),
          points: num(r.points),
          visitDays: num(r.visitDays),
          lastSeen: r.lastSeen === null ? null : String(r.lastSeen),
          recentHits: num(r.recentHits),
        })),
        feedback: (statsQ.feedback.all() as Array<Record<string, unknown>>).map((r) => ({
          id: num(r.id),
          createdAt: String(r.created_at),
          userId: String(r.user_id),
          displayName: r.display_name === null ? "" : String(r.display_name),
          email: String(r.email),
          message: String(r.message),
        })),
      };
    },

    // ── /explain 用のダンプ ───────────────────────────────────
    /**
     * 説明画面・管理画面用。行は全件表示し、認証情報とMAC原文は列単位で除外する。
     * full（管理画面）のときだけ、メールと問い合わせ、アクセス数も出す。
     */
    dump(full = false): DbTable[] {
      const uCols = [
        "id", "user_id", "display_name", ...(full ? ["email"] : []), "avatar", "avatar_source", "hidden",
        "discoverable", "onboarding_completed_at", "created_at",
      ];
      const mCols = ["id", "user_id", "mac", "label", "registered_at"];
      const fCols = ["id", "user_low", "user_high", "status", "requested_by", "request_id",
        "best_low", "best_high", "created_at", "friends_since"];
      const pCols = ["id", "user_id", "date", "kind", "label", "pts", "other_user_id", "days"];
      const rows = (stmt: { all: () => unknown[] }, columns: string[]) =>
        (stmt.all() as Record<string, unknown>[]).map((r) => cells(r, columns));

      return [
        {
          name: "users",
          note: full ? "登録した人。Google ID と共有キーは出さない。" : "登録した人。メール、Google ID、共有キーは公開しない。",
          columns: uCols,
          rows: (dumpQ.users.all() as Record<string, unknown>[]).map((r) => cells({
            ...r, avatar: r.avatar ? `（画像 ${Math.round(String(r.avatar).length / 1024)}KB）` : null,
          }, uCols)),
        },
        {
          name: "mac_addresses",
          note: "登録端末。MAC原文は伏せてある。",
          columns: mCols,
          rows: (dumpQ.macs.all() as Record<string, unknown>[]).map((r) => cells({ ...r, mac: maskMac(String(r.mac)) }, mCols)),
        },
        {
          name: "friendships",
          note: "(A,B) と (B,A) は id の小さい方を user_low にして1行に畳む。best は片側ずつのフラグで、両方1ならベストフレンド成立。",
          columns: fCols,
          rows: rows(dumpQ.friendships, fCols),
        },
        {
          name: "blocks",
          note: "一方向。ブロックされた側からは、この行があることが分からないようにしてある。",
          columns: ["blocker_id", "blocked_id", "created_at"],
          rows: rows(dumpQ.blocks, ["blocker_id", "blocked_id", "created_at"]),
        },
        {
          name: "point_events",
          note: "入ったポイント1件が1行。今日の分と累計はここを数えている。",
          columns: pCols,
          rows: rows(dumpQ.points, pCols),
        },
        {
          name: "reactions",
          note: "スライムを連打したリアクションの、まだ届いていない分。受け手の画面に送り手のスライムが出たら消える。",
          columns: ["from_id", "to_id", "count", "updated_at"],
          rows: rows(dumpQ.reactions, ["from_id", "to_id", "count", "updated_at"]),
        },
        {
          name: "visits",
          note: "来校した日。連続日数（streak）の判定に使う。",
          columns: ["user_id", "date"],
          rows: rows(dumpQ.visits, ["user_id", "date"]),
        },
        {
          name: "matches",
          note: "相手ごとの、最後にマッチした日。久しぶり／はじめての判定に使う。一方向に持つ。",
          columns: ["user_id", "other_user_id", "last_date"],
          rows: rows(dumpQ.matches, ["user_id", "other_user_id", "last_date"]),
        },
        ...(full ? [
          {
            name: "feedback",
            note: "アプリの中から届いた問い合わせ・ご意見。新しい順。",
            columns: ["id", "user_id", "date", "message", "created_at"],
            rows: rows(dumpQ.feedback, ["id", "user_id", "date", "message", "created_at"]),
          },
          {
            name: "access_daily",
            note: "API を呼んだ回数を、日本時間の1日・1人ごとに数えたもの。user_id 0 はログインしていない呼び出し。",
            columns: ["date", "user_id", "hits"],
            rows: rows(dumpQ.accessDaily, ["date", "user_id", "hits"]),
          },
          {
            name: "access_routes",
            note: "API を呼んだ回数を、1日・1ルートごとに数えたもの。",
            columns: ["date", "method", "route", "hits"],
            rows: rows(dumpQ.accessRoutes, ["date", "method", "route", "hits"]),
          },
        ] : []),
      ];
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
