/**
 * COKOYO アプリ ⇄ バックエンド の契約。
 *
 * 出どころは frontend-v2/docs/api-for-backend.md（2026-09-15 にグループで決めた仕様）。
 * frontend-v2/src/api/types.ts と同じ形でなければならず、
 * backend/test/contract.test-d.ts が型レベルで一致を検査している。
 *
 *   ベースURL: https://cokoyo.lazyta-toru.net/api  （パスの先頭は /v1）
 *   本人の判断: サーバー側セッションのHttpOnly Cookie
 */

export type BestState = "none" | "outgoing" | "incoming" | "best";

export interface UserRef {
  userId: string;
  displayName: string;
  /**
   * アイコンの画像（data URL）。登録していない人は入らない。
   * 128px四方の JPEG に縮めてから送る決まりで、だいたい 10〜30KB。
   */
  avatar?: string;
}

export interface Me extends UserRef {
  email: string;
  shareKey: string;
  hidden: boolean;
  /** 「知り合いかも」に自分を出してよいか */
  discoverable: boolean;
  macs: MacAddressView[];
}

export interface MacAddressView {
  id: number;
  label: string;
  macMasked: string;
  registeredAt: string;
}

export interface Friend extends UserRef {
  friendsSince: string;
  best: BestState;
}

/**
 * 「知り合いかも」に出す相手。
 *
 * mutual は、あなたと相手に共通のフレンド。名前を出すのは、
 * どちらもあなたのフレンドで、申請するかどうかの手がかりになるため。
 * 並びは、ベストフレンドとつながっている人・共通が多い人が先（理由そのものは返さない）。
 */
export interface Suggestion extends UserRef {
  mutual: UserRef[];
}

export interface SuggestionsResponse {
  suggestions: Suggestion[];
}

export interface FriendRequest extends UserRef {
  requestId: string;
  createdAt: string;
}

export interface BlockedUser extends UserRef {
  blockedAt: string;
}

export interface FriendsResponse {
  friends: Friend[];
  requests: { incoming: FriendRequest[]; outgoing: FriendRequest[] };
  blocked: BlockedUser[];
}

export type PointKind = "base" | "streak" | "rain" | "match" | "reunion" | "first";

export interface PointItem {
  kind: PointKind;
  label: string;
  pts: number;
  userId?: string;
  days?: number;
}

export interface PointsResponse {
  date: string;
  today: { items: PointItem[]; total: number };
  total: number;
}

/** スライムを連打して届いたリアクション。送った人のスライムが画面に出たときに届く。 */
export interface Reaction {
  /** 送ってきたフレンド */
  userId: string;
  /** 連打した回数（まとめて届く。99まで） */
  count: number;
}

/** POST /v1/friends/:userId/reactions の返事 */
export interface ReactionResponse {
  userId: string;
  /** 受け付けた回数 */
  count: number;
}

export interface FriendPresence {
  userId: string;
  present: boolean;
  /** ベストフレンド同士のときだけ入る。 */
  building?: string;
  /** 地図に置く場所。building と同じ条件でだけ入る。 */
  buildingKey?: BuildingKey;
}

export interface CheckResponse {
  checkedAt: string;
  me: { presence: "present" | "absent" | "unknown"; building: string | null; buildingKey: BuildingKey | null; hidden: boolean };
  weather: { condition: string; rainy: boolean };
  friends: FriendPresence[];
  points: PointsResponse & { awarded: PointItem[]; notice: string | null };
  /** 今回スライムが出たフレンドから、届いていたリアクション */
  reactions: Reaction[];
}

export interface AddFriendResponse {
  status: "friends" | "requested";
  requestId?: string;
  user: UserRef;
}

/**
 * 招待リンク・QRの相手。申請する前に「この人に申請しますか？」と名前を見せるために使う。
 * relation は、いまのあなたとの関係（すでにフレンド・申請ずみなら、確認を出さずに知らせる）。
 */
export interface InviteResponse {
  user: UserRef;
  relation: "none" | "friends" | "requested" | "incoming";
}

export interface BestResponse {
  userId: string;
  best: BestState;
}

export interface BlockResponse {
  userId: string;
  blocked: boolean;
}

/** 問い合わせ・ご意見を送ったときの返事 */
export interface FeedbackResponse {
  /** その日あと何回送れるか */
  remaining: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/**
 * /explain（説明用ページ）で中身を見せるための、DBの生の行。
 * アプリ本体は使わない。返すのは呼び出した本人に関係する行だけ。
 */
export interface DbTable {
  /** テーブル名（SQLite のものそのまま） */
  name: string;
  /** 何のテーブルか、何を絞ったかの説明 */
  note: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

export interface DebugDbResponse {
  tables: DbTable[];
}

/** GET /v1/admin/session。管理用パスワードで入っているか。 */
export interface AdminSessionResponse {
  admin: boolean;
}

/** GET /v1/admin/stats。管理画面の数字。日付はすべて日本時間の YYYY-MM-DD。 */
export interface AdminStatsResponse {
  generatedAt: string;
  today: string;
  totals: {
    /** 初回登録まで終えた人 */
    users: number;
    /** Google ログインはしたが、初回登録が終わっていない人 */
    onboarding: number;
    hidden: number;
    macs: number;
    friendships: number;
    bestFriends: number;
    pendingRequests: number;
    blocks: number;
    feedback: number;
    points: number;
  };
  /** API を1回でも呼んだ人数（今日・直近7日・直近30日） */
  active: { today: number; week: number; month: number };
  /** 直近30日、古い順 */
  daily: Array<{
    date: string;
    signups: number;
    activeUsers: number;
    hits: number;
    /** ログインしていない呼び出し */
    anonHits: number;
    /** 在校と判定された人数（visits） */
    visitors: number;
  }>;
  /** 直近7日の、ルートごとの呼び出し回数。多い順 */
  routes: Array<{ method: string; route: string; hits: number }>;
  users: Array<{
    userId: string;
    displayName: string;
    email: string;
    createdAt: string;
    onboarded: boolean;
    hidden: boolean;
    macs: number;
    friends: number;
    points: number;
    visitDays: number;
    /** 最後に API を呼んだ日 */
    lastSeen: string | null;
    /** 直近30日の呼び出し回数 */
    recentHits: number;
  }>;
  /** 新しい順 */
  feedback: Array<{
    id: number;
    createdAt: string;
    userId: string;
    displayName: string;
    email: string;
    message: string;
  }>;
}

/**
 * POST /v1/client-errors で送る1件。返事まで届かなかった（fetch が投げた）呼び出し。
 * サーバーには何も届いていないので、ブラウザが溜めておいて、次に繋がったときに送る。
 */
export interface ClientNetworkError {
  /** 失敗した時刻（端末の時計、ISO） */
  at: string;
  method: string;
  /** /v1/... 。ID などの値はバックエンドで伏せる */
  path: string;
  /** navigator.onLine。false なら端末自身がオフラインだと分かっていた */
  online: boolean;
  /** 画面が表示中だったか。false なら裏に回っていた */
  visible: boolean;
  /** 送ってから失敗するまで（ミリ秒） */
  ms: number;
  /** ページを開いてから失敗するまで（ミリ秒） */
  sinceLoad: number;
  /** ブラウザのエラー文（"Load failed" など。ブラウザごとに違う） */
  message: string;
}

export interface ClientErrorsRequest {
  errors: ClientNetworkError[];
}

/**
 * 管理画面の「ログ」の1行。
 *   start   … バックエンドが起動した（デプロイ・再起動。前後は繋がらない時間がある）
 *   error   … 5xx を返した
 *   slow    … 返すまでに時間がかかった
 *   network … ブラウザから、返事まで届かなかったと知らせてきた
 */
export interface OpsEvent {
  id: number;
  at: string;
  /** バックエンドが記録した時刻。network は at より後になる */
  reportedAt: string;
  source: "server" | "client";
  kind: "start" | "error" | "slow" | "network";
  method: string | null;
  /** /api/v1/friends/:userId/best のような形。値は入れない */
  route: string | null;
  status: number | null;
  ms: number | null;
  online: boolean | null;
  visible: boolean | null;
  sinceLoad: number | null;
  message: string | null;
}

/** GET /v1/admin/logs。新しい順 */
export interface AdminLogsResponse {
  events: OpsEvent[];
  /** DB に残しておく件数の上限。超えたら古いものから消える */
  kept: number;
}

/** DTC が返す buildingKey（api.dtc.wide.ad.jp の enum と一致させること）。 */
export const BUILDING_KEYS = [
  "kappa", "epsilon", "iota", "omicron", "delta", "tau", "mu",
  "omega", "alpha", "theta", "lambda", "pe-buildings", "sigma", "lounge",
  // ここから下は、大学のAPIが建物に結びつけていないアクセスポイントの名前から、COKOYOが当てた場所
  // （バックエンドの src/dtc.ts の AP_PLACES）
  "zeta", "gamma", "beta", "eta", "nu",
] as const;

export type BuildingKey = (typeof BUILDING_KEYS)[number];

/**
 * buildingKey を、画面にそのまま出す名前に直す。
 * ギリシャ文字の大文字・小文字は、大学の公式のキャンパスマップに合わせる
 * （κ ε ι ο τ λ β ν は小文字、Δ Μ Ω Α Θ Σ Ζ Γ Η は大文字）。
 */
export const BUILDING_LABELS: Record<BuildingKey, string> = {
  kappa: "κ館",
  epsilon: "ε館",
  iota: "ι館",
  omicron: "ο館",
  delta: "Δ館",
  tau: "τ館",
  // Μ館。学生は「メディアセンター」と呼ぶ
  mu: "メディアセンター",
  omega: "Ω館",
  alpha: "Α館",
  theta: "Θ館",
  lambda: "λ館",
  "pe-buildings": "体育施設",
  // 鴨池ラウンジは Σ館の中にあるので、そこにいる人は sigma になる
  sigma: "Σ館",
  // 大学のAPIの lounge は、鴨池の東の「学生ラウンジ」。学生は「サブウェイ」と呼ぶ
  lounge: "学生ラウンジ（サブウェイ）",
  zeta: "Ζ館",
  gamma: "Γ館",
  beta: "βヴィレッジ",
  eta: "Ηヴィレッジ",
  nu: "νエリア",
};
