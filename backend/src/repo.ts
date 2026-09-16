import type { DbTable } from "../../shared/app-types.js";
import type { Db } from "./db.js";
import { hashToken, newRequestId, newShareKey, newUserId } from "./lib/ids.js";
import { maskMac } from "./lib/mac.js";

export interface User {
  id: number;
  user_id: string;
  display_name: string;
  share_key: string;
  mac: string;
  hidden: number;
  mac_registered_at: string;
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
  "id, user_id, display_name, share_key, mac, hidden, mac_registered_at";

/** 常に (小さい方, 大きい方) の順に揃える。 */
const pair = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

export function createRepo(db: Db) {
  const one = <T>(row: unknown): T | undefined => (row ? ({ ...(row as T) } as T) : undefined);
  const many = <T>(rows: unknown[]): T[] => rows.map((r) => ({ ...(r as T) }) as T);

  const q = {
    userById: db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`),
    userByUserId: db.prepare(`SELECT ${USER_COLS} FROM users WHERE user_id = ?`),
    userByShareKey: db.prepare(`SELECT ${USER_COLS} FROM users WHERE share_key = ?`),
    userByMac: db.prepare(`SELECT ${USER_COLS} FROM users WHERE mac = ?`),
    userByToken: db.prepare(`SELECT ${USER_COLS} FROM users WHERE device_token_hash = ?`),
    insertUser: db.prepare(
      `INSERT INTO users (user_id, display_name, share_key, device_token_hash, mac,
                          hidden, mac_registered_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ),
    updateProfile: db.prepare("UPDATE users SET display_name = ?, hidden = ? WHERE id = ?"),
    updateToken: db.prepare("UPDATE users SET device_token_hash = ? WHERE id = ?"),
    updateMac: db.prepare("UPDATE users SET mac = ?, mac_registered_at = ? WHERE id = ?"),

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
  const dumpQ = {
    me: db.prepare("SELECT * FROM users WHERE id = ?"),
    others: db.prepare(
      `SELECT id, user_id, display_name FROM users WHERE id IN (
         SELECT CASE WHEN user_low = ? THEN user_high ELSE user_low END
         FROM friendships WHERE user_low = ? OR user_high = ?
         UNION SELECT blocked_id FROM blocks WHERE blocker_id = ?
       ) ORDER BY id`,
    ),
    friendships: db.prepare("SELECT * FROM friendships WHERE user_low = ? OR user_high = ? ORDER BY id"),
    blocks: db.prepare("SELECT * FROM blocks WHERE blocker_id = ? ORDER BY created_at"),
    points: db.prepare("SELECT * FROM (SELECT * FROM point_events WHERE user_id = ? ORDER BY id DESC LIMIT 30) ORDER BY id"),
    visits: db.prepare("SELECT * FROM (SELECT * FROM visits WHERE user_id = ? ORDER BY date DESC LIMIT 14) ORDER BY date"),
    matches: db.prepare("SELECT * FROM matches WHERE user_id = ? ORDER BY other_user_id"),
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
    findByToken: (token: string) => one<User>(q.userByToken.get(hashToken(token))),

    createUser(displayName: string, mac: string, deviceToken: string): User {
      const now = new Date().toISOString();
      q.insertUser.run(
        newUserId(), displayName, newShareKey(), hashToken(deviceToken), mac, now, now,
      );
      const user = one<User>(q.userByMac.get(mac));
      if (!user) throw new Error("failed to persist user");
      return user;
    },

    updateProfile(id: number, displayName: string, hidden: boolean): void {
      q.updateProfile.run(displayName, hidden ? 1 : 0, id);
    },

    /** 端末トークンを作り直す。前の端末はこれで使えなくなる。 */
    rotateToken(id: number, deviceToken: string): void {
      q.updateToken.run(hashToken(deviceToken), id);
    },

    updateMac(id: number, mac: string): void {
      q.updateMac.run(mac, new Date().toISOString(), id);
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

    hasVisited: (userId: number, date: string) => Boolean(q.visit.get(userId, date)),
    recordVisit: (userId: number, date: string) => void q.insertVisit.run(userId, date),

    lastMatchDate(userId: number, otherId: number): string | null {
      const row = one<{ last_date: string }>(q.match.get(userId, otherId));
      return row?.last_date ?? null;
    },
    recordMatch: (userId: number, otherId: number, date: string) =>
      void q.upsertMatch.run(userId, otherId, date),

    // ── /explain 用のダンプ ───────────────────────────────────
    /**
     * 呼んだ本人に関係する行だけを、テーブルの形のまま返す。
     *
     * 他人の行は user_id と display_name しか出さない。MAC は伏せ、
     * 端末トークンのハッシュは頭だけにする（平文はそもそも無い）。
     * 自分をブロックしている人は出さない（アプリでも見せていない）。
     */
    dump(me: number): DbTable[] {
      const uRow = dumpQ.me.get(me) as Record<string, unknown> | undefined;
      const uCols = [
        "id", "user_id", "display_name", "share_key", "device_token_hash",
        "mac", "hidden", "mac_registered_at", "created_at",
      ];
      const others = dumpQ.others.all(me, me, me, me) as Record<string, unknown>[];
      const userRows: Cell[][] = [];
      if (uRow) {
        userRows.push(cells(
          {
            ...uRow,
            device_token_hash: `${String(uRow.device_token_hash).slice(0, 12)}…`,
            mac: maskMac(String(uRow.mac)),
          },
          uCols,
        ));
      }
      for (const o of others) {
        userRows.push([o.id as number, o.user_id as string, o.display_name as string,
          "—", "—", "—", null, null, null]);
      }

      const fCols = ["id", "user_low", "user_high", "status", "requested_by", "request_id",
        "best_low", "best_high", "created_at", "friends_since"];
      const pCols = ["id", "date", "kind", "label", "pts", "other_user_id", "days"];

      return [
        {
          name: "users",
          note: "自分の行と、関わりのある人の行。他人は user_id と表示名だけ（— は伏せた列）。",
          columns: uCols,
          rows: userRows,
        },
        {
          name: "friendships",
          note: "(A,B) と (B,A) は id の小さい方を user_low にして1行に畳む。best は片側ずつのフラグ。",
          columns: fCols,
          rows: (dumpQ.friendships.all(me, me) as Record<string, unknown>[]).map((r) => cells(r, fCols)),
        },
        {
          name: "blocks",
          note: "一方向。自分がブロックした相手だけ（自分をブロックしている人は出さない）。",
          columns: ["blocker_id", "blocked_id", "created_at"],
          rows: (dumpQ.blocks.all(me) as Record<string, unknown>[])
            .map((r) => cells(r, ["blocker_id", "blocked_id", "created_at"])),
        },
        {
          name: "point_events",
          note: "入ったポイント1件が1行。今日の分と累計はここを数えている。直近30件。",
          columns: pCols,
          rows: (dumpQ.points.all(me) as Record<string, unknown>[]).map((r) => cells(r, pCols)),
        },
        {
          name: "visits",
          note: "来校した日。連続日数（streak）の判定に使う。直近14日。",
          columns: ["date"],
          rows: (dumpQ.visits.all(me) as Record<string, unknown>[]).map((r) => cells(r, ["date"])),
        },
        {
          name: "matches",
          note: "相手ごとの、最後にマッチした日。久しぶり／はじめての判定に使う。",
          columns: ["other_user_id", "last_date"],
          rows: (dumpQ.matches.all(me) as Record<string, unknown>[])
            .map((r) => cells(r, ["other_user_id", "last_date"])),
        },
      ];
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
