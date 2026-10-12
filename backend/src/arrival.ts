// キャンパスに着いたら知らせる
//
// ブラウザ（PWA）からは、つないでいるWiFiの名前も、つないだ瞬間も分からない。
// そこでサーバーが数分おきに、登録された端末を大学のAPIで引き、
// 今日まだポイントを得ていない人がキャンパスに現れたら「ポイントを獲得しよう」と通知する。
//
// 1人1日1回まで。知らせた人・今日もう在校確認した人は、その日はもう引かない。
// 引くのは通知をオンにしている人だけ（オフの人を見張る理由は無い）。

import type { DtcClient } from "./dtc.js";
import { jstDate, shiftDate } from "./lib/time.js";
import { limiter, lookupUser } from "./lookup.js";
import type { PushSender } from "./push.js";
import type { Repo } from "./repo.js";

/** DTC の記録は5分おきなので、それより細かく見ても変わらない */
export const ARRIVAL_INTERVAL_MS = 5 * 60 * 1000;
/** 見張る時間帯（日本時間）。1限の前から、最後の授業が終わるころまで */
export const ARRIVAL_HOURS = { from: 8, to: 19 } as const;
/** 大学のAPIに同時に投げる数。人が押す在校確認（8）より控えめにする */
const CONCURRENCY = 4;

export const ARRIVAL_MESSAGE = {
  title: "キャンパスに着きましたね",
  body: "今日のポイントを獲得しましょう。開いて「ポイント獲得」を押してください。",
  tag: "arrival",
} as const;

const jstHour = (at: Date) => (at.getUTCHours() + 9) % 24;

/**
 * 1回ぶん見て回る。知らせた人数を返す（テスト用）。
 * 見張る時間帯の外では何もしない。
 */
export async function checkArrivals(repo: Repo, dtc: DtcClient, push: PushSender, at = new Date()): Promise<number> {
  const hour = jstHour(at);
  if (hour < ARRIVAL_HOURS.from || hour >= ARRIVAL_HOURS.to) return 0;

  const today = jstDate(at);
  repo.pruneArrivals(shiftDate(today, -7));
  const limited = limiter(CONCURRENCY);
  const sent = await Promise.all(repo.arrivalCandidates(today).map(async (id) => {
    const lookup = await lookupUser(repo, dtc, { id }, limited);
    // 引いているあいだに在校確認を押したかもしれない
    if (lookup.status !== "present" || repo.hasVisited(id, today)) return false;
    // 先に印をつける（送っている途中に次の回が来ても、二重に送らない）
    if (!repo.markArrival(id, today)) return false;
    await push.send(id, { ...ARRIVAL_MESSAGE, url: `./?arrived=${today}` }).catch(() => { /* 届かなくても、また明日 */ });
    return true;
  }));
  return sent.filter(Boolean).length;
}

/** 起動したら回し始める。止める関数を返す */
export function startArrivalWatch(repo: Repo, dtc: DtcClient, push: PushSender): () => void {
  let running = false;
  const tick = () => {
    if (running) return; // 前の回が大学のAPIの遅れで終わっていなければ飛ばす
    running = true;
    checkArrivals(repo, dtc, push)
      .catch((e) => console.error("arrival watch failed:", e instanceof Error ? e.name : "unknown"))
      .finally(() => { running = false; });
  };
  const timer = setInterval(tick, ARRIVAL_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
