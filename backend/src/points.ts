import type { PointItem } from "../../shared/app-types.js";
import { isWeekend, shiftDate } from "./lib/time.js";
import type { Repo, User } from "./repo.js";

/** 100pt ＝ 1円の感覚。 */
const P = { BASE: 250, RAIN: 125, MATCH: 100, REUNION: 500, FIRST: 750, CAP: 10 } as const;

/** [連続日数, 加算pt]。高いほうから見て、当てはまった1つだけ入る。 */
const STREAK: ReadonlyArray<readonly [number, number]> = [
  [14, 250],
  [7, 125],
  [3, 50],
];

const REUNION_DAYS = 30;

/** 雨の日ボーナスの対象。DTC の weather.condition を見る。 */
const RAINY = ["drizzle", "rain", "shower", "thunderstorm", "sleet", "snow"];

export const isRainy = (condition: string | null): boolean =>
  condition !== null && RAINY.includes(condition);

/**
 * 連続来校の日数。土日は飛ばして数えるので、週末を挟んでも途切れない。
 * 今日のぶんは呼ぶ前に記録しておくこと。
 */
function streakCount(repo: Repo, userId: number, today: string): number {
  let days = 0;
  let cursor = today;
  for (;;) {
    if (isWeekend(cursor)) {
      cursor = shiftDate(cursor, -1);
      continue;
    }
    if (!repo.hasVisited(userId, cursor)) return days;
    days += 1;
    cursor = shiftDate(cursor, -1);
  }
}

const daysBetween = (from: string, to: string): number =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  );

export interface VisibleFriend {
  user: User;
  present: boolean;
}

export interface AwardResult {
  awarded: PointItem[];
  notice: string | null;
}

/**
 * 「ポイント獲得（在校確認）」を押したときの加算。
 *
 * - キャンパス外なら何も入らない
 * - base / streak / rain はその日はじめて押したときだけ
 * - マッチは、押した時点で在校が見えていて、今日まだマッチしていないフレンドだけ
 * - かくれんぼ中の本人にはマッチが入らない（base などは入る）
 */
export function awardPoints(
  repo: Repo,
  me: User,
  input: { present: boolean; rainy: boolean; friends: VisibleFriend[]; today: string },
): AwardResult {
  const { present, rainy, friends, today } = input;
  const awarded: PointItem[] = [];
  let notice: string | null = null;

  if (!present) {
    return { awarded, notice: "キャンパス外なので、ポイントは入りません" };
  }

  const record = (item: PointItem, otherId: number | null) => {
    awarded.push(item);
    repo.addPoint(me.id, today, item.kind, item.label, item.pts, otherId, item.days ?? null);
  };

  // その日はじめてのときだけ：来校ベース・連続・雨
  const already = repo.pointsOfDay(me.id, today);
  if (!already.some((p) => p.kind === "base")) {
    record({ kind: "base", label: "来校ベース", pts: P.BASE }, null);

    repo.recordVisit(me.id, today);
    const days = streakCount(repo, me.id, today);
    const bonus = STREAK.find(([n]) => days >= n);
    if (bonus) {
      record({ kind: "streak", label: `${days}日連続で来校`, pts: bonus[1], days }, null);
    }

    if (rainy) record({ kind: "rain", label: "雨の日ボーナス", pts: P.RAIN }, null);
  }

  if (me.hidden !== 0) {
    return { awarded, notice: "かくれんぼ中は、フレンドとのマッチポイントは入りません" };
  }

  const matchedToday = new Set(
    repo
      .pointsOfDay(me.id, today)
      .filter((p) => p.other_user_id !== null)
      .map((p) => p.other_user_id as number),
  );
  let count = matchedToday.size;

  for (const friend of friends) {
    if (!friend.present || matchedToday.has(friend.user.id)) continue;
    if (count >= P.CAP) {
      notice = "フレンドとのマッチポイントは1日10人までです";
      break;
    }

    const name = friend.user.display_name;
    const last = repo.lastMatchDate(me.id, friend.user.id);
    const gap = last ? daysBetween(last, today) : 0;

    const item: PointItem =
      last === null
        ? { kind: "first", label: `${name}さんとはじめてマッチ`, pts: P.FIRST }
        : gap >= REUNION_DAYS
          ? { kind: "reunion", label: `${name}さんと${gap}日ぶりにマッチ`, pts: P.REUNION, days: gap }
          : { kind: "match", label: `${name}さんとマッチ`, pts: P.MATCH };

    record({ ...item, userId: friend.user.user_id }, friend.user.id);
    repo.recordMatch(me.id, friend.user.id, today);
    matchedToday.add(friend.user.id);
    count += 1;
  }

  return { awarded, notice };
}
