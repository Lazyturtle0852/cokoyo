import type { BuildingKey } from "../../shared/api-types.js";
import { config } from "./config.js";
import { toColonMac } from "./lib/mac.js";
import { sleep } from "./lib/time.js";

export type Lookup =
  | { status: "present"; buildingKey?: BuildingKey }
  /** 観測が無い。「いない」として扱う。 */
  | { status: "absent" }
  /** DTC 側の都合で答えが得られなかった。「いない」とは区別する。 */
  | { status: "unavailable" };

export interface DtcClient {
  /**
   * 最新の観測を1件だけ引く。
   *
   * 履歴は絶対に取りに行かない。DTC は時間範囲を渡すと最大7日分を返すうえ認証が無いので、
   * これを中継すると移動の軌跡がそのまま漏れる（仕様06）。
   */
  latest(mac: string): Promise<Lookup>;
}

/** 503 は取り込み中を意味する。落ちているわけではないので少しだけ粘る。 */
const RETRY_DELAYS_MS = [400, 800];

/**
 * 実API。api.dtc.wide.ad.jp は認証が無いので資格情報は要らない。
 *
 * 観測が一度も無いMACは、404 ではなく 503 が返ることがある。
 * DTC 側は「未パースのスナップショットが存在するか」で 503 を判定しており、
 * 観測が無いMACではその比較対象が無いため、古い未パースが残っている限り
 * 恒久的に 503 になる。したがって 503 を「いない」と同一視してはいけないが、
 * リクエスト全体を失敗させてもいけない — unavailable として個別に扱う。
 */
export class RealDtcClient implements DtcClient {
  constructor(private readonly baseUrl: string) {}

  async latest(mac: string): Promise<Lookup> {
    const url = `${this.baseUrl}/wifi/clients/${toColonMac(mac)}/connection`;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: { accept: "application/json" } });
      } catch {
        return { status: "unavailable" };
      }

      if (res.status === 404) return { status: "absent" };

      if (res.status === 503) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) return { status: "unavailable" };
        await sleep(delay);
        continue;
      }

      if (!res.ok) return { status: "unavailable" };

      const body = (await res.json().catch(() => null)) as {
        history?: Array<{ time: string; buildingKey?: BuildingKey }>;
      } | null;

      const latest = body?.history?.[0];
      if (!latest) return { status: "absent" };

      // APが建物に紐づいていない場合 buildingKey は入らない。在校自体は真。
      return { status: "present", buildingKey: latest.buildingKey };
    }
  }
}

const MOCK_BUILDINGS: BuildingKey[] = ["iota", "tau", "omega", "epsilon", "delta", "lambda"];

/**
 * モック。MACから決定的に組み立てるので、同じMACは同じ時間帯に常に同じ結果になる。
 * デモとテストで同じものを使える。
 */
export class MockDtcClient implements DtcClient {
  constructor(private readonly latencyMs = 80) {}

  async latest(mac: string): Promise<Lookup> {
    await sleep(this.latencyMs);

    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    let hash = 0;
    for (const ch of `${mac}:${bucket}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

    if (hash % 10 < 3) return { status: "absent" };
    return { status: "present", buildingKey: MOCK_BUILDINGS[hash % MOCK_BUILDINGS.length] };
  }
}

export function createDtcClient(): DtcClient {
  return config.mockDtc ? new MockDtcClient() : new RealDtcClient(config.dtcBaseUrl);
}
