import "node:process";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num("PORT", 8080),
  dbPath: process.env.DB_PATH ?? "./data/cokoyo.db",
  mockDtc: (process.env.MOCK_DTC ?? "1") !== "0",
  dtcBaseUrl: (process.env.DTC_BASE_URL ?? "https://api.dtc.wide.ad.jp").replace(/\/+$/, ""),
  /** 仕様06。打ち切られたリクエストが速く返ることで block を悟られないようにする。 */
  timingFloorMs: num("TIMING_FLOOR_MS", 250),
  registerRateLimit: num("REGISTER_RATE_LIMIT", 20),
} as const;
