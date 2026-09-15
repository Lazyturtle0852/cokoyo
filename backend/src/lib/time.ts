const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * 仕様06。秒精度で建物が返ると、連続して呼ぶだけで移動の軌跡が再構成できる。
 * 「今どこにいるか」だけを渡し、「どう動いたか」は渡さない。
 */
export function roundToFiveMinutes(date: Date): string {
  return new Date(Math.floor(date.getTime() / FIVE_MIN_MS) * FIVE_MIN_MS).toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
