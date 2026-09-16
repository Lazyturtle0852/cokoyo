// バックエンドとやりとりするデータの形
// docs/api-for-backend.md と同じ。どちらかを変えたら、もう片方も合わせる。

export type BestState = 'none' | 'outgoing' | 'incoming' | 'best';

export interface UserRef {
  userId: string;
  displayName: string;
}

export interface Me extends UserRef {
  shareKey: string;
  hidden: boolean;
  macMasked: string;
  macRegisteredAt: string;
}

export interface RegisterResponse extends Me {
  deviceToken: string;
}

export interface Friend extends UserRef {
  friendsSince: string;
  best: BestState;
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

export type PointKind = 'base' | 'streak' | 'rain' | 'match' | 'reunion' | 'first';

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

export interface FriendPresence {
  userId: string;
  present: boolean;
  building?: string;
  buildingKey?: BuildingKey;
}

export interface CheckResponse {
  checkedAt: string;
  me: { present: boolean; building: string | null; buildingKey: BuildingKey | null; hidden: boolean };
  weather: { condition: string; rainy: boolean };
  friends: FriendPresence[];
  points: PointsResponse & { awarded: PointItem[]; notice: string | null };
}

export interface AddFriendResponse {
  status: 'friends' | 'requested';
  requestId?: string;
  user: UserRef;
}

export interface BestResponse {
  userId: string;
  best: BestState;
}

export interface BlockResponse {
  userId: string;
  blocked: boolean;
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

/** DTC が返す buildingKey（api.dtc.wide.ad.jp の enum と一致させること）。 */
export const BUILDING_KEYS = [
  'kappa', 'epsilon', 'iota', 'omicron', 'delta', 'tau', 'mu',
  'omega', 'alpha', 'theta', 'lambda', 'pe-buildings', 'sigma', 'lounge',
] as const;

export type BuildingKey = (typeof BUILDING_KEYS)[number];

/** buildingKey を、画面にそのまま出す名前に直す。 */
export const BUILDING_LABELS: Record<BuildingKey, string> = {
  kappa: 'κ館',
  epsilon: 'ε館',
  iota: 'ι館',
  omicron: 'ο館',
  delta: 'δ館',
  tau: 'τ館',
  mu: 'μ館',
  omega: 'ω館',
  alpha: 'α館',
  theta: 'θ館',
  lambda: 'λ館',
  'pe-buildings': '体育施設',
  sigma: 'σ館',
  lounge: 'ラウンジ',
};
