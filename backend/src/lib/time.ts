const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ポイントの「今日」は日本時間で区切る。 */
export function jstDate(at: Date = new Date()): string {
  return new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD を日本時間の日付として足し引きする。 */
export function shiftDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`).getTime();
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 土日か。連続来校は平日だけ数え、土日では途切れない。 */
export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 今日（土日なら直前の金曜）からさかのぼった平日 n 日。古い順。
 * キャンパスは平日に使われるので、管理画面・分析ページの「直近」は平日で数える。
 */
export function recentWeekdays(today: string, n: number): string[] {
  const days: string[] = [];
  for (let d = today; days.length < n; d = shiftDate(d, -1)) if (!isWeekend(d)) days.unshift(d);
  return days;
}

/** SQL で日付の列が平日か（列名を渡す） */
export const weekdaySql = (col = "date") => `strftime('%w', ${col}) NOT IN ('0', '6')`;
