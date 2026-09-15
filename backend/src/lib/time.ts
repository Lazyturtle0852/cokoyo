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
