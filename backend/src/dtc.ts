import { BUILDING_KEYS, type BuildingKey } from "../../shared/app-types.js";
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
   * これを中継すると移動の軌跡がそのまま漏れる。
   */
  latest(mac: string): Promise<Lookup>;
  /** 雨の日ボーナスの判定に使う。取れなければ null。 */
  weather(): Promise<string | null>;
}

/**
 * 大学のAPIが建物に結びつけていないアクセスポイント（2026-10-05 時点で52台、在校者の約16%）。
 * 名前の頭で、COKOYO 側で場所を当てる。対応は、大学の公式のキャンパスマップと
 * OpenStreetMap の建物の位置を見て、ユーザーと確かめた（2026-10-05）。
 *
 * 名前は大学側が内部で付けているもので、予告なく変わりうる。変わったら当たらなくなり、
 * その人は「建物の外にいる可能性があります」に戻るだけで、在校の判定には響かない。
 * 大学のAPIが buildingKey を返したときは、常にそちらを優先する。
 */
const AP_PLACES: ReadonlyArray<readonly [RegExp, BuildingKey]> = [
  [/^ap-nmc-/, "mu"],      // メディアセンター。ap-mu と同じ建物の別の系統
  [/^ap-b-/, "beta"],      // βヴィレッジ（ap-b-dom1・dom4・dome・paper）
  [/^ap-eta-/, "eta"],     // Ηヴィレッジ
  [/^ap-nu-/, "nu"],       // νエリア（ap-nu-a・b・c・e）
  [/^ap-zeta-/, "zeta"],   // Ζ館
  [/^ap-gamma-/, "gamma"], // Γ館
];

const KNOWN = new Set<string>(BUILDING_KEYS);

/**
 * 観測から場所を決める。大学のAPIの buildingKey を先に使い、無ければアクセスポイントの名前で当てる。
 * どちらでも分からなければ undefined（在校ではあるが、場所は分からない）。
 * 知らない buildingKey（大学側で建物が増えたときなど）は、画面に出せないので場所なしにする。
 */
export function placeOf(obs: { buildingKey?: string; accessPointName?: string }): BuildingKey | undefined {
  if (obs.buildingKey) return KNOWN.has(obs.buildingKey) ? (obs.buildingKey as BuildingKey) : undefined;
  const name = obs.accessPointName ?? "";
  return AP_PLACES.find(([pattern]) => pattern.test(name))?.[1];
}

/** 503 は取り込み中を意味する。落ちているわけではないので少しだけ粘る。 */
const RETRY_DELAYS_MS = [400, 800];

/**
 * 時間を指定しない connection は「最後に見えた1件」を返す。何時間前でも、昨日でも返ってくる。
 * そのため、帰宅したあとも最後に見えた建物で「在校」になっていた。
 *
 * DTC の記録は5分おき。処理済みの最新の記録から5分より前の観測は「もういない」とみなす。
 * 最新と1つ前の記録までは在校なので、スマホがWiFiを一瞬切って1回取りこぼしても在校のまま。
 * 記録の時刻は回ごとに数秒ずれるので、1つ前が5分ちょうどで外れないよう30秒だけ余裕を持たせる。
 */
export const FRESH_MS = 5 * 60 * 1000 + 30 * 1000;
/** 処理済みの最新時刻が取れないときは、ふだんの遅れ（約5分）を今から引いて代わりにする。 */
const TYPICAL_LAG_MS = 5 * 60 * 1000;
/** /health/snmp は回数制限があるので、1分は使い回す。 */
const REFERENCE_TTL_MS = 60 * 1000;

/** 観測がまだ「いま」と言えるか。reference は DTC が処理を終えた最新の記録の時刻。 */
export function isFresh(observedAt: string, reference: number): boolean {
  const at = Date.parse(observedAt);
  return Number.isFinite(at) && at >= reference - FRESH_MS;
}

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
  private reference: { fetchedAt: number; value: Promise<number | null> } | null = null;

  constructor(private readonly baseUrl: string) {}

  /**
   * DTC が処理を終えた最新の記録の時刻。今の時刻ではなくこれと比べるのは、
   * DTC の処理が遅れているあいだに、キャンパスにいる人まで「いない」にしないため。
   * 処理が滞っているときは 503 でも同じ形で返ってくるので、そちらも読む。
   */
  private latestProcessedAt(): Promise<number | null> {
    const now = Date.now();
    if (this.reference && now - this.reference.fetchedAt < REFERENCE_TTL_MS) return this.reference.value;
    const value = fetch(`${this.baseUrl}/health/snmp`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) })
      .then((res) => res.json() as Promise<{ latestProcessedAt?: string }>)
      .then((body) => {
        const at = Date.parse(body.latestProcessedAt ?? "");
        return Number.isFinite(at) ? at : null;
      })
      .catch(() => null);
    this.reference = { fetchedAt: now, value };
    return value;
  }

  async latest(mac: string): Promise<Lookup> {
    const url = `${this.baseUrl}/wifi/clients/${toColonMac(mac)}/connection`;
    const signal = AbortSignal.timeout(4000);

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: { accept: "application/json" }, signal });
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
        history?: Array<{ time: string; buildingKey?: string; accessPointName?: string }>;
      } | null;

      const latest = body?.history?.[0];
      if (!latest) return { status: "absent" };

      // 最後に見えたのが前の記録なら、もうキャンパスを出ている
      const reference = (await this.latestProcessedAt()) ?? Date.now() - TYPICAL_LAG_MS;
      if (!isFresh(latest.time, reference)) return { status: "absent" };

      // APが建物に紐づいていない場合 buildingKey は入らない。在校自体は真。
      // そのときはアクセスポイントの名前から場所を当てる（AP_PLACES）
      const buildingKey = placeOf(latest);
      return buildingKey ? { status: "present", buildingKey } : { status: "present" };
    }
  }

  async weather(): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/weather`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const body = (await res.json()) as { weather?: { condition?: string } };
      return body.weather?.condition ?? null;
    } catch {
      return null;
    }
  }
}

const MOCK_BUILDINGS: BuildingKey[] = ["iota", "tau", "omega", "epsilon", "delta", "lambda", "mu", "beta"];

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

  async weather(): Promise<string | null> {
    return "cloudy";
  }
}

export function createDtcClient(): DtcClient {
  return config.mockDtc ? new MockDtcClient() : new RealDtcClient(config.dtcBaseUrl);
}
