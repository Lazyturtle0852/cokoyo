// 運営者向けの分析（/admin/insights/）
//
// 管理画面（/admin/）とは別に、離脱・継続・時間帯・つながり・機能の使われ方を出す。
// 返すのは集計と、名前・メール・IDを外して連番にした1人1行だけ。
//
// 在校確認を押した回数と、機能ごとの回数は、ここで足した表に残す。
// ほかの作業（DBのバージョンを上げる変更）とぶつからないよう、表は起動時に
// CREATE TABLE IF NOT EXISTS で作り、スキーマのバージョンは上げない。

import type { InsightsResponse } from "../../shared/app-types.js";
import type { Db } from "./db.js";
import { jstDate, shiftDate } from "./lib/time.js";

const JST_MS = 9 * 60 * 60 * 1000;

export type UsageKind = "check" | "greet" | "reaction";

export function createInsights(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS check_daily (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,                -- 日本時間の YYYY-MM-DD
      checks INTEGER NOT NULL,           -- 在校確認を押した回数
      present INTEGER NOT NULL,          -- そのうち、キャンパスにいると判定された回数
      PRIMARY KEY (user_id, date)
    );
    CREATE TABLE IF NOT EXISTS usage_hourly (
      date TEXT NOT NULL,                -- 日本時間の YYYY-MM-DD
      hour INTEGER NOT NULL,             -- 日本時間の 0〜23
      kind TEXT NOT NULL,                -- check / greet / reaction
      count INTEGER NOT NULL,            -- 誰が押したかは残さない
      PRIMARY KEY (date, hour, kind)
    );
  `);

  const q = {
    check: db.prepare(
      `INSERT INTO check_daily (user_id, date, checks, present) VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET checks = checks + 1, present = present + excluded.present`,
    ),
    usage: db.prepare(
      `INSERT INTO usage_hourly (date, hour, kind, count) VALUES (?, ?, ?, 1)
       ON CONFLICT(date, hour, kind) DO UPDATE SET count = count + 1`,
    ),
  };

  const all = (sql: string, ...args: (string | number)[]) =>
    db.prepare(sql).all(...args) as Array<Record<string, unknown>>;
  const get = (sql: string, ...args: (string | number)[]) =>
    (db.prepare(sql).get(...args) ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => Number(v ?? 0);

  function count(kind: UsageKind, at = new Date()) {
    const jst = new Date(at.getTime() + JST_MS);
    q.usage.run(jstDate(at), jst.getUTCHours(), kind);
  }

  return {
    /** 在校確認を1回押した。present はキャンパスにいると判定されたか */
    recordCheck(userId: number, present: boolean) {
      q.check.run(userId, jstDate(), present ? 1 : 0);
      count("check");
    },
    count,

    report(): InsightsResponse {
      const today = jstDate();
      const from30 = shiftDate(today, -29);
      const from7 = shiftDate(today, -6);
      const onboarded = "onboarding_completed_at IS NOT NULL";
      const checkLogSince = (get("SELECT MIN(date) AS d FROM check_daily").d as string | null) ?? null;

      // ── 離脱：段階ごとの人数（下の段階ほど、上の段階の人の中に含まれる）──
      // フレンドの有無は順番に並ばない（来校していなくてもフレンドはいる）ので、ここには入れず network に出す
      const n = (sql: string) => num(get(sql).n);
      const pressed = n(`SELECT COUNT(*) AS n FROM users u WHERE ${onboarded} AND (
          EXISTS (SELECT 1 FROM check_daily c WHERE c.user_id = u.id)
          OR EXISTS (SELECT 1 FROM visits v WHERE v.user_id = u.id))`);
      const funnel: InsightsResponse["funnel"] = [
        { key: "login", label: "Googleでログインした", count: n("SELECT COUNT(*) AS n FROM users") },
        { key: "onboarded", label: "登録を終えた（MACアドレスまで）", count: n(`SELECT COUNT(*) AS n FROM users WHERE ${onboarded}`) },
        {
          key: "pressed", label: "在校確認を押した", count: pressed,
          note: checkLogSince ? `${checkLogSince}より前は、キャンパスで確認できた人だけ数えています` : "回数の記録はこれから。今はキャンパスで確認できた人だけ数えています",
        },
        { key: "visited", label: "キャンパスで確認できた", count: n("SELECT COUNT(DISTINCT user_id) AS n FROM visits") },
        { key: "visit2", label: "2日以上キャンパスで確認できた", count: n("SELECT COUNT(*) AS n FROM (SELECT user_id FROM visits GROUP BY user_id HAVING COUNT(*) >= 2)") },
        { key: "visit5", label: "5日以上キャンパスで確認できた", count: n("SELECT COUNT(*) AS n FROM (SELECT user_id FROM visits GROUP BY user_id HAVING COUNT(*) >= 5)") },
      ];

      // ── 継続：登録した週ごとに、その後の週にアプリを開いた人数 ──────────
      // 週は月曜はじまり。開いた＝その日に API を1回でも呼んだ（access_daily）
      const monday = (date: string) => {
        const d = new Date(`${date}T00:00:00Z`);
        return shiftDate(date, -((d.getUTCDay() + 6) % 7));
      };
      const cohortOf = new Map<number, string>();
      for (const r of all(`SELECT id, date(onboarding_completed_at, '+9 hours') AS d FROM users WHERE ${onboarded}`)) {
        cohortOf.set(num(r.id), monday(String(r.d)));
      }
      const thisWeek = monday(today);
      const weeksBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / (7 * 86400000));
      const active = new Map<string, Set<number>>(); // "cohort|週番号" → 人
      for (const r of all("SELECT DISTINCT user_id, date FROM access_daily WHERE user_id > 0")) {
        const id = num(r.user_id);
        const cohort = cohortOf.get(id);
        if (!cohort) continue;
        const w = weeksBetween(cohort, monday(String(r.date)));
        if (w < 0) continue;
        const key = `${cohort}|${w}`;
        if (!active.has(key)) active.set(key, new Set());
        active.get(key)!.add(id);
      }
      const sizes = new Map<string, number>();
      for (const c of cohortOf.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1);
      const retention = [...sizes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohort, size]) => ({
        cohort, size,
        weeks: Array.from({ length: weeksBetween(cohort, thisWeek) + 1 }, (_, w) => active.get(`${cohort}|${w}`)?.size ?? 0),
      }));

      // ── いつ：日ごと・曜日×時間 ──────────────────────────
      const byDate = (rows: Array<Record<string, unknown>>, key = "n") => new Map(rows.map((r) => [String(r.date), num(r[key])]));
      const actives = byDate(all("SELECT date, COUNT(*) AS n FROM access_daily WHERE user_id > 0 AND date >= ? GROUP BY date", from30));
      const visitors = byDate(all("SELECT date, COUNT(*) AS n FROM visits WHERE date >= ? GROUP BY date", from30));
      const checks = byDate(all("SELECT date, SUM(count) AS n FROM usage_hourly WHERE kind = 'check' AND date >= ? GROUP BY date", from30));
      const greets = byDate(all("SELECT date, SUM(count) AS n FROM usage_hourly WHERE kind = 'greet' AND date >= ? GROUP BY date", from30));
      const signups = byDate(all(`SELECT date(onboarding_completed_at, '+9 hours') AS date, COUNT(*) AS n FROM users
        WHERE ${onboarded} AND date(onboarding_completed_at, '+9 hours') >= ? GROUP BY 1`, from30));
      const daily = Array.from({ length: 30 }, (_, i) => {
        const date = shiftDate(from30, i);
        return {
          date, active: actives.get(date) ?? 0, visitors: visitors.get(date) ?? 0,
          checks: checks.get(date) ?? 0, greets: greets.get(date) ?? 0, newUsers: signups.get(date) ?? 0,
        };
      });
      const grid = () => Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
      const heatChecks = grid();
      for (const r of all("SELECT date, hour, count FROM usage_hourly WHERE kind = 'check'")) {
        heatChecks[new Date(`${r.date}T00:00:00Z`).getUTCDay()]![num(r.hour)]! += num(r.count);
      }
      const heatFirst = grid();
      for (const r of all(`SELECT CAST(strftime('%w', created_at, '+9 hours') AS INTEGER) AS wd,
          CAST(strftime('%H', created_at, '+9 hours') AS INTEGER) AS h, COUNT(*) AS n
          FROM point_events WHERE kind = 'base' GROUP BY 1, 2`)) {
        heatFirst[num(r.wd)]![num(r.h)]! += num(r.n);
      }

      // ── つながり ──────────────────────────────────────
      const friendCount = new Map<number, number>();
      for (const r of all(`SELECT id FROM users WHERE ${onboarded}`)) friendCount.set(num(r.id), 0);
      for (const r of all("SELECT user_low, user_high FROM friendships WHERE status = 'friends'")) {
        for (const id of [num(r.user_low), num(r.user_high)]) if (friendCount.has(id)) friendCount.set(id, friendCount.get(id)! + 1);
      }
      const counts = [...friendCount.values()];
      const bucket = (lo: number, hi: number) => counts.filter((c) => c >= lo && c <= hi).length;
      const pairs = get(`SELECT SUM(status = 'friends') AS friends, SUM(status = 'pending') AS pending,
        SUM(status = 'friends' AND best_low = 1 AND best_high = 1) AS best FROM friendships`);
      const friendPairs = num(pairs.friends);
      const pending = num(pairs.pending);
      // マッチは相手ごとに両側に記録されるので、組の数は半分
      const matches7d = Math.round(num(get("SELECT COUNT(*) AS n FROM point_events WHERE kind IN ('match', 'reunion', 'first') AND date >= ?", from7).n) / 2);

      // ── 機能 ──────────────────────────────────────────
      const usage7d = (kind: UsageKind) => num(get("SELECT SUM(count) AS n FROM usage_hourly WHERE kind = ? AND date >= ?", kind, from7).n);
      const f = get(`SELECT COUNT(*) AS users,
          SUM(slime_color IS NOT NULL) AS color, SUM(hidden = 1) AS hidden, SUM(discoverable = 0) AS notDiscoverable,
          SUM(EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = users.id)) AS push
        FROM users WHERE ${onboarded}`);

      // ── 1人1行（連番） ────────────────────────────────────
      const people = all(`SELECT u.id, date(u.created_at, '+9 hours') AS signedUp, u.${onboarded} AS onboarded,
          (SELECT COUNT(*) FROM visits v WHERE v.user_id = u.id) AS visitDays,
          (SELECT COUNT(*) FROM visits v WHERE v.user_id = u.id AND v.date >= ?) AS visitDays30,
          (SELECT COUNT(*) FROM access_daily a WHERE a.user_id = u.id AND a.date >= ?) AS activeDays30,
          (SELECT COALESCE(SUM(checks), 0) FROM check_daily c WHERE c.user_id = u.id AND c.date >= ?) AS checks30,
          (SELECT MAX(date) FROM access_daily a WHERE a.user_id = u.id) AS lastActive,
          EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id) AS push
        FROM users u ORDER BY u.created_at`, from30, from30, from30).map((r, i) => ({
        n: i + 1,
        signedUp: String(r.signedUp),
        onboarded: num(r.onboarded) === 1,
        friends: friendCount.get(num(r.id)) ?? 0,
        visitDays: num(r.visitDays),
        visitDays30: num(r.visitDays30),
        activeDays30: num(r.activeDays30),
        checks30: num(r.checks30),
        lastActive: (r.lastActive as string | null) ?? null,
        push: num(r.push) === 1,
      }));

      return {
        generatedAt: new Date().toISOString(),
        today,
        checkLogSince,
        funnel,
        retention,
        daily,
        heat: { checks: heatChecks, firstVisits: heatFirst },
        network: {
          users: counts.length,
          zeroFriends: bucket(0, 0),
          avgFriends: counts.length ? Math.round((counts.reduce((a, b) => a + b, 0) / counts.length) * 10) / 10 : 0,
          histogram: [
            { label: "0人", users: bucket(0, 0) }, { label: "1人", users: bucket(1, 1) },
            { label: "2〜4人", users: bucket(2, 4) }, { label: "5〜9人", users: bucket(5, 9) },
            { label: "10人以上", users: bucket(10, Infinity) },
          ],
          friendPairs,
          bestPairs: num(pairs.best),
          pendingRequests: pending,
          acceptRate: friendPairs + pending ? friendPairs / (friendPairs + pending) : null,
          matches7d,
        },
        features: {
          users: num(f.users),
          pushUsers: num(f.push),
          colorUsers: num(f.color),
          hiddenUsers: num(f.hidden),
          notDiscoverableUsers: num(f.notDiscoverable),
          greets7d: usage7d("greet"),
          reactions7d: usage7d("reaction"),
        },
        people,
      };
    },
  };
}

export type Insights = ReturnType<typeof createInsights>;
