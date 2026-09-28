import type { DbTable } from "../../shared/app-types.js";
import type { Db } from "./db.js";
import { hashToken, newRequestId, newShareKey, newUserId } from "./lib/ids.js";
import { maskMac } from "./lib/mac.js";

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
  "id, user_id, google_sub, email, display_name, avatar, avatar_source, share_key, hidden, onboarding_completed_at";

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
    updateProfile: db.prepare("UPDATE users SET display_name = ?, hidden = ? WHERE id = ?"),
    updateAvatar: db.prepare("UPDATE users SET avatar = ?, avatar_source = ? WHERE id = ?"),
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

    updateProfile(id: number, displayName: string, hidden: boolean): void {
      q.updateProfile.run(displayName, hidden ? 1 : 0, id);
    },
    updateAvatar: (id: number, avatar: string | null) =>
      void q.updateAvatar.run(avatar, avatar ? "custom" : "disabled", id),
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

    // ── /explain 用のダンプ ───────────────────────────────────
    /** 公開説明画面用。行は全件表示し、認証情報とMAC原文は列単位で除外する。 */
    dump(): DbTable[] {
      const uCols = [
        "id", "user_id", "display_name", "avatar", "avatar_source", "hidden", "onboarding_completed_at", "created_at",
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
          note: "登録した人。メール、Google ID、共有キーは公開しない。",
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
      ];
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
