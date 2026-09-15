import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 応答時間の下限はテストでは不要。平坦化そのものは timing.test.ts で確認する。
    env: { TIMING_FLOOR_MS: "0", MOCK_DTC: "1", DB_PATH: ":memory:" },
  },
});
