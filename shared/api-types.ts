/**
 * COKOYO v1 PoC — API 型定義
 *
 * 仕様: docs/v1-poc.html の 04 章
 * フロント／バックエンドの双方がこのファイルを参照する。
 *
 * ベースURL: https://cokoyo.lazyta-toru.net/api/v1
 * 開発時は Vite の dev proxy で /api に向けるので、環境によるURL切り替えは不要。
 *
 *   // vite.config.ts
 *   server: { proxy: { "/api": { target: "https://cokoyo.lazyta-toru.net", changeOrigin: true } } }
 */

/** 公開する粒度。無向 — 1つの connection に1つだけ持ち、双方に同じ値が効く。 */
export type Scope = "campus" | "building";

// ─────────────────────────────────────────────
// 建物
// ─────────────────────────────────────────────

/** DTC の buildingKey をそのまま通す（api.dtc.wide.ad.jp の enum と一致させること）。 */
export const BUILDING_KEYS = [
  "kappa",
  "epsilon",
  "iota",
  "omicron",
  "delta",
  "tau",
  "mu",
  "omega",
  "alpha",
  "theta",
  "lambda",
  "pe-buildings",
  "sigma",
  "lounge",
] as const;

export type BuildingKey = (typeof BUILDING_KEYS)[number];

/** 表示用。バックエンドはキーのまま返すので、ラベル付けはフロント側で行う。 */
export const BUILDING_LABELS: Record<BuildingKey, string> = {
  kappa: "κ館",
  epsilon: "ε館",
  iota: "ι館",
  omicron: "ο館",
  delta: "δ館",
  tau: "τ館",
  mu: "μ館",
  omega: "ω館",
  alpha: "α館",
  theta: "θ館",
  lambda: "λ館",
  "pe-buildings": "体育施設",
  sigma: "σ館",
  lounge: "ラウンジ",
};


/**
 * 配る値。LINE や QR で友達に渡す。公開される前提。
 * これ単体では何もできない（認証は secret が担う）。
 */
export type ShareKey = string;

/**
 * 配らない値。端末内（localStorage）にだけ置く。
 * 全リクエストで `Authorization: Bearer <secret>` として送る。
 */
export type Secret = string;

// ─────────────────────────────────────────────
// POST /register   認証なし
// ─────────────────────────────────────────────

export interface RegisterRequest {
  /** 手入力されたMAC。区切りの有無・大文字小文字は問わない（サーバー側で正規化する）。 */
  mac: string;
  /** 共有文字列に載せる表示名。サーバーは保存しない。 */
  name?: string;
}

export interface RegisterResponse {
  share_key: ShareKey;
  secret: Secret;
}

// ─────────────────────────────────────────────
// POST /connections   secret
// ─────────────────────────────────────────────

export interface CreateConnectionRequest {
  share_key: ShareKey;
}

export interface Connection {
  share_key: ShareKey;
  scope: Scope;
  blocked: boolean;
}

export type CreateConnectionResponse = Connection;

// ─────────────────────────────────────────────
// PATCH /connections/{share_key}   secret
// ─────────────────────────────────────────────

export interface UpdateConnectionRequest {
  scope?: Scope;
  blocked?: boolean;
}

export type UpdateConnectionResponse = Connection;

// ─────────────────────────────────────────────
// POST /presence   secret
// ─────────────────────────────────────────────

export interface PresenceRequest {
  share_keys: ShareKey[];
}

export interface PresenceResult {
  share_key: ShareKey;
  /**
   * いない・ブロックされている・つながっていない・存在しないkey は
   * すべて `false` で返る。区別はできない（仕様06）。
   */
  present: boolean;
  /** present かつ scope が "building" のときだけ入る。 */
  building?: BuildingKey;
}

export interface PresenceResponse {
  results: PresenceResult[];
  /** 5分に丸めた観測時刻。 */
  as_of: string;
  /**
   * DTC に問い合わせられなかった相手が含まれるとき true。
   * その相手も `present: false` で返る（どの相手かは示さない）ので、
   * UI は「いない」ではなく「確認できませんでした」と出すとよい。
   */
  degraded?: boolean;
}

// ─────────────────────────────────────────────
// GET /me   secret
// ─────────────────────────────────────────────

export interface MeResponse {
  share_key: ShareKey;
  connections: Connection[];
}

// ─────────────────────────────────────────────
// エラー
// ─────────────────────────────────────────────

/**
 * 在校の問い合わせで「見つからない」系のエラーは返らない（すべて present:false）。
 * ここに出るのは、認証の失敗と、DTC 側の障害だけ。
 */
export type ApiErrorType =
  | "UNAUTHORIZED"       // 401 secret が無効
  | "VALIDATION_ERROR"   // 400 MACの書式など
  | "RATE_LIMITED"       // 429
  | "UPSTREAM_ERROR"     // 502 DTC が落ちている / 処理中
  | "SERVER_ERROR";      // 500

export interface ApiError {
  error: {
    type: ApiErrorType;
    message: string;
  };
}

// ─────────────────────────────────────────────
// 共有文字列
// ─────────────────────────────────────────────

/** LINE に貼る / QR に載せる形式。URLにはしない（プレビューや履歴に残るため）。 */
export const SHARE_PREFIX = "cokoyo1";

/** 例: cokoyo1:k_7f3a9c21e84b06d5:りょうま */
export function buildShareString(shareKey: ShareKey, name: string): string {
  return `${SHARE_PREFIX}:${shareKey}:${name}`;
}

export function parseShareString(
  input: string,
): { shareKey: ShareKey; name: string } | null {
  const trimmed = input.trim();
  const first = trimmed.indexOf(":");
  if (first === -1 || trimmed.slice(0, first) !== SHARE_PREFIX) return null;

  const second = trimmed.indexOf(":", first + 1);
  if (second === -1) return null;

  const shareKey = trimmed.slice(first + 1, second);
  const name = trimmed.slice(second + 1);
  if (!shareKey || !name) return null;

  return { shareKey, name };
}
