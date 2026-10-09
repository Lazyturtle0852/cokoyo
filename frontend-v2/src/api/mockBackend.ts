// アプリのバックエンドの模擬
//
// 本物のバックエンドができるまで、ブラウザの中でAPIの代わりをする。
// パス・受け取るもの・返すものは docs/api-for-backend.md と同じ。
// 本物に繋ぐときは使われない（src/config.ts）。
//
// 中身は「バックエンドのデータ」と「大学側APIの模擬（キャンパスの様子）」の2つ。
// 状態はブラウザに保存するので、ページを開き直しても続きから使える。

import type { BestState, BuildingKey, PointItem, PointKind, Reaction } from './types';
import { BUILDING_KEYS, BUILDING_LABELS } from './types';

// Google アカウントと複数MACの形に変わったため、旧デモの保存は使わない。
const STORE_KEY = 'cokoyo-mock-backend:v6'; // 「知り合いかも」用のつながりを足したので作り直す

// ---------------------------------------------------------------
// ポイントの決まり
//
// 普通の日（フレンド5人・雨でもはじめてでもない日）で 55〜70pt、
// 月16日通って 880〜1,120pt になる値。backend/src/points.ts と同じ値にすること。
// ---------------------------------------------------------------
// マッチの1日の上限は無い（バックエンドの src/points.ts と同じ）
const P = { BASE: 20, RAIN: 10, MATCH: 6, REUNION: 50, FIRST: 70 };
// リアクションをためておける数。backend/src/routes.ts と同じ値にすること。
const REACTION = { MAX: 99, TTL_MS: 3 * 24 * 60 * 60 * 1000 };
const STREAK: [number, number][] = [[14, 20], [7, 10], [3, 5]]; // [連続日数, 加算pt]
const REUNION_DAYS = 30;
const RAINY = ['drizzle', 'rain', 'shower', 'thunderstorm', 'sleet', 'snow'];
/** デモ操作で選べる建物。DTC が返す buildingKey と同じ。 */
export const BUILDINGS = BUILDING_KEYS;
export const buildingLabel = (key: BuildingKey) => BUILDING_LABELS[key];

// ---------------------------------------------------------------
// データの形（バックエンドの中だけで使う）
// ---------------------------------------------------------------
interface DbUser {
  /** 「知り合いかも」に出してよいか（無ければ出す） */
  discoverable?: boolean; name: string; mac: string; shareKey: string; hidden: boolean; macRegisteredAt: string; createdAt: string; email?: string; avatar?: string; avatarSource?: 'google' | 'custom' | 'disabled'; macs?: { id: number; mac: string; label: string; registeredAt: string }[]; onboarded?: boolean }
interface Campus { connected: boolean; buildingKey: BuildingKey; unavailable?: boolean }
interface Ledger {
  total: number;
  visitDays: string[];
  lastMatch: Record<string, string>;
  days: Record<string, { baseDone: boolean; items: PointItem[]; matched: Record<string, PointKind> }>;
}
interface Db {
  users: Record<string, DbUser>;
  campus: Record<string, Campus>;
  macCampus?: Record<string, Campus>;
  friendships: { a: string; b: string; since: string }[];
  friendRequests: { id: string; from: string; to: string; createdAt: string }[];
  best: { a: string; b: string; since: string }[];
  bestRequests: { from: string; to: string; createdAt: string }[];
  blocks: { by: string; target: string; at: string }[];
  weather: string;
  points: Record<string, Ledger>;
  /** まだ届いていないリアクション。送り手→受け手ごとに1つ */
  reactions: { from: string; to: string; count: number; at: string }[];
}

export interface MockResult { status: number; json: unknown }

/** 問い合わせ（模擬。ページを閉じると消える） */
const feedback: { uid: string; message: string; at: string }[] = [];

// ---------------------------------------------------------------
// 日付
// ---------------------------------------------------------------
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);

function prevWeekdays(from: Date, n: number) {
  const out: Date[] = [];
  let d = addDays(from, -1);
  while (out.length < n) { if (!isWeekend(d)) out.push(d); d = addDays(d, -1); }
  return out;
}

// 連続来校日数。今日は必ず数え、前の平日をさかのぼる（土日では途切れない）
function streakCount(visitSet: Set<string>, today: Date) {
  let n = 1;
  let d = addDays(today, -1);
  for (;;) {
    if (isWeekend(d)) { d = addDays(d, -1); continue; }
    if (!visitSet.has(fmt(d))) break;
    n++; d = addDays(d, -1);
  }
  return n;
}

const rand = (prefix: string, n: number) => prefix + Array.from(crypto.getRandomValues(new Uint8Array(n)),
  (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

// ---------------------------------------------------------------
// 最初の状態
// ---------------------------------------------------------------
const DEMO_GOOGLE_AVATAR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#d8e8f7"/><circle cx="64" cy="49" r="23" fill="#557da7"/><path d="M22 119c0-27 19-43 42-43s42 16 42 43" fill="#557da7"/></svg>')}`;

function seed(): Db {
  const today = startOfDay(new Date());
  const wd = prevWeekdays(today, 4); // 昨日までの平日4日 → 今日来ると5日連続
  const ago = (n: number) => addDays(today, -n).toISOString();
  const user = (name: string, mac: string, shareKey: string, extra: Partial<DbUser> = {}): DbUser => ({
    name, mac, shareKey, hidden: false, macRegisteredAt: ago(20), createdAt: ago(30),
    email: `user-${mac.replace(/:/g, '').slice(0, 8)}@keio.jp`,
    macs: [{ id: 1, mac, label: '端末', registeredAt: ago(20) }], onboarded: true, ...extra,
  });
  const empty = (): Ledger => ({ total: 0, visitDays: [], lastMatch: {}, days: {} });

  return {
    users: {
      u_me:        user('ゆうき', 'a2:3f:9c:1b:7e:44', 'sk_m8qe4tz2', { macRegisteredAt: ago(12), avatar: DEMO_GOOGLE_AVATAR, avatarSource: 'google' }),
      u_sato:      user('佐藤',   '5c:e1:08:77:3a:b2', 'sk_s3nv7kpa'),
      u_tanaka:    user('田中',   'd6:4b:92:0f:c8:13', 'sk_t9wd2hxe'),
      u_suzuki:    user('鈴木',   '7e:a0:5d:e6:21:9f', 'sk_z4rc8mfu', { hidden: true }),
      u_yamada:    user('山田',   '3a:f7:c4:58:0b:6e', 'sk_y6hp3bnq'),
      u_takahashi: user('高橋',   '9e:12:6b:d0:44:c7', 'sk_k2xa5gvw'),
      u_ito:       user('伊藤',   'f2:58:a1:3c:9d:06', 'sk_i7jt4qzs'),
      u_kobayashi: user('小林',   '6b:3e:f1:82:57:ac', 'sk_b5nk9wdt'),
    },
    campus: {
      u_me:        { connected: false, buildingKey: 'kappa' },
      u_sato:      { connected: true,  buildingKey: 'kappa' },
      u_tanaka:    { connected: true,  buildingKey: 'epsilon' },
      u_suzuki:    { connected: true,  buildingKey: 'omega' },
      u_yamada:    { connected: true,  buildingKey: 'theta' },
      u_takahashi: { connected: false, buildingKey: 'iota' },
      u_ito:       { connected: true,  buildingKey: 'tau' },
      u_kobayashi: { connected: true,  buildingKey: 'lounge' },
    },
    friendships: [
      { a: 'u_me', b: 'u_sato',   since: ago(90) },
      { a: 'u_me', b: 'u_tanaka', since: ago(120) },
      { a: 'u_me', b: 'u_suzuki', since: ago(60) },
      { a: 'u_me', b: 'u_ito',    since: ago(200) },
      // 「知り合いかも」を試すための、フレンドどうしのつながり
      { a: 'u_sato',   b: 'u_yamada',    since: ago(50) },  // 山田＝共通のフレンド2人（佐藤・田中）
      { a: 'u_tanaka', b: 'u_yamada',    since: ago(30) },
      { a: 'u_sato',   b: 'u_kobayashi', since: ago(20) },  // 小林＝ベストフレンド（佐藤）のフレンド
    ],
    friendRequests: [{ id: 'fr_takahashi', from: 'u_takahashi', to: 'u_me', createdAt: ago(1) }],
    best: [{ a: 'u_me', b: 'u_sato', since: ago(40) }],
    bestRequests: [{ from: 'u_tanaka', to: 'u_me', createdAt: ago(0) }],
    blocks: [{ by: 'u_me', target: 'u_ito', at: ago(14) }],
    weather: 'mainly_clear',
    points: {
      u_me: {
        total: 640,
        visitDays: wd.map(fmt),
        lastMatch: { u_sato: fmt(wd[1]), u_tanaka: fmt(addDays(today, -45)), u_suzuki: fmt(addDays(today, -20)), u_ito: fmt(addDays(today, -60)) },
        days: {},
      },
      u_sato: empty(), u_tanaka: empty(), u_suzuki: empty(), u_yamada: empty(), u_takahashi: empty(), u_ito: empty(), u_kobayashi: empty(),
    },
    reactions: [],
  };
}

let db: Db = (() => {
  try { const s = localStorage.getItem(STORE_KEY); if (s) return JSON.parse(s) as Db; } catch { /* 保存できない環境 */ }
  return seed();
})();
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* 保存できない環境 */ } };
const SESSION_KEY = 'cokoyo-mock-session:v3';
let sessionUid: string | null = (() => {
  try { const saved = localStorage.getItem(SESSION_KEY); return saved === null ? 'u_me' : saved || null; }
  catch { return 'u_me'; }
})();
const setSession = (uid: string | null) => {
  sessionUid = uid;
  try { localStorage.setItem(SESSION_KEY, uid ?? ''); } catch { /* 保存できない環境 */ }
};

// ---------------------------------------------------------------
// 関係の判定
// ---------------------------------------------------------------
const samePair = (x: { a: string; b: string }, a: string, b: string) => (x.a === a && x.b === b) || (x.a === b && x.b === a);
const isFriend = (a: string, b: string) => db.friendships.some((f) => samePair(f, a, b));
const blockedBy = (by: string, target: string) => db.blocks.some((x) => x.by === by && x.target === target);
const blockedEither = (a: string, b: string) => blockedBy(a, b) || blockedBy(b, a);
const isBest = (a: string, b: string) => db.best.some((x) => samePair(x, a, b));

// me から見た other とのベストフレンドの状態
function bestState(me: string, other: string): BestState {
  if (isBest(me, other)) return 'best';
  if (db.bestRequests.some((r) => r.from === me && r.to === other)) return 'outgoing';
  if (db.bestRequests.some((r) => r.from === other && r.to === me)) return 'incoming';
  return 'none';
}

// viewer に target の在校を見せてよいか。だめなら「いない」と同じ形で返す（理由は区別しない）
function visiblePresence(viewer: string, target: string): { present: boolean; building?: string; buildingKey?: BuildingKey } {
  const c = aggregatePresence(target);
  const u = db.users[target];
  if (c.presence !== 'present' || u.hidden || blockedEither(viewer, target) || !isFriend(viewer, target)) return { present: false };
  // 建物を出すのはベストフレンド同士のときだけ。本物のバックエンドと同じ条件。
  return isBest(viewer, target) && c.buildingKey
    ? { present: true, building: BUILDING_LABELS[c.buildingKey], buildingKey: c.buildingKey }
    : { present: true };
}

const publicUser = (uid: string) => ({ userId: uid, displayName: db.users[uid].name,
  ...(db.users[uid].avatar ? { avatar: db.users[uid].avatar } : {}) });
const maskMac = (mac: string) => { const p = mac.split(':'); return `${p[0]}:${p[1]}:••:••:••:${p[5]}`; };
const normalizeMac = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/-/g, ':');
const validMac = (s: string) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s) && s !== '02:00:00:00:00:00';
const macsOf = (uid: string) => db.users[uid].macs ?? (db.users[uid].macs = [{ id: 1, mac: db.users[uid].mac, label: '端末', registeredAt: db.users[uid].macRegisteredAt }]);
const macView = (entry: { id: number; mac: string; label: string; registeredAt: string }) =>
  ({ id: entry.id, label: entry.label, macMasked: maskMac(entry.mac), registeredAt: entry.registeredAt });
const macOwner = (mac: string) => Object.keys(db.users).find((uid) => macsOf(uid).some((entry) => entry.mac === mac));
const macCampus = (uid: string, id: number): Campus => db.macCampus?.[`${uid}:${id}`] ?? db.campus[uid];
function aggregatePresence(uid: string): { presence: 'present' | 'absent' | 'unknown'; buildingKey: BuildingKey | null } {
  const observations = macsOf(uid).map((entry) => macCampus(uid, entry.id));
  const present = observations.filter((c) => c.connected && !c.unavailable);
  if (present.length) {
    const keys = new Set(present.map((c) => c.buildingKey));
    return { presence: 'present', buildingKey: keys.size === 1 && !observations.some((c) => c.unavailable) ? present[0].buildingKey : null };
  }
  return { presence: observations.some((c) => c.unavailable) ? 'unknown' : 'absent', buildingKey: null };
}

// ---------------------------------------------------------------
// API本体
// ---------------------------------------------------------------
type Body = Record<string, unknown>;
const E = (status: number, code: string, message: string): MockResult => ({ status, json: { error: { code, message } } });
const ok = (json: unknown, status = 200): MockResult => ({ status, json });

function meView(uid: string) {
  const u = db.users[uid];
  return { ...publicUser(uid), email: u.email ?? 'demo@keio.jp', shareKey: u.shareKey, hidden: u.hidden,
    discoverable: u.discoverable !== false, macs: macsOf(uid).map(macView) };
}

const AVATAR_MAX = 120 * 1024;
function updateAvatar(uid: string, body: Body): MockResult {
  const image = String(body.image ?? '');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return E(400, 'invalid_avatar', '画像の形式が正しくありません（JPEG・PNG・WebP）');
  if (image.length > AVATAR_MAX) return E(400, 'avatar_too_large', '画像が大きすぎます');
  db.users[uid].avatar = image;
  db.users[uid].avatarSource = 'custom';
  return ok(meView(uid));
}

function completeOnboarding(uid: string, body: Body): MockResult {
  const name = String(body.displayName ?? '').trim();
  const label = String(body.label ?? '').trim();
  const mac = normalizeMac(body.mac);
  if (!name || name.length > 20) return E(400, 'invalid_name', '表示名は1〜20文字で入力してください');
  if (!label || label.length > 30) return E(400, 'invalid_label', '端末の名前は1〜30文字で入力してください');
  if (!validMac(mac)) return E(400, 'invalid_mac', 'MACアドレスの形式が正しくありません');
  if (macOwner(mac)) return E(409, 'mac_taken', 'このMACアドレスはすでに登録されています');
  const u = db.users[uid];
  if (u.onboarded !== false) return E(409, 'already_onboarded', '初回登録は完了しています');
  u.name = name; u.mac = mac; u.shareKey = rand('sk_', 8); u.onboarded = true;
  u.macRegisteredAt = new Date().toISOString();
  u.macs = [{ id: 1, mac, label, registeredAt: u.macRegisteredAt }];
  return ok(meView(uid), 201);
}

function addMac(uid: string, body: Body): MockResult {
  const mac = normalizeMac(body.mac);
  const label = String(body.label ?? '').trim();
  if (!validMac(mac)) return E(400, 'invalid_mac', 'MACアドレスの形式が正しくありません');
  if (!label || label.length > 30) return E(400, 'invalid_label', '端末の名前は1〜30文字で入力してください');
  if (macOwner(mac)) return E(409, 'mac_taken', 'このMACアドレスはすでに登録されています');
  const macs = macsOf(uid);
  if (macs.length >= 5) return E(409, 'mac_limit', '登録できる端末は5台までです');
  const entry = { id: Math.max(0, ...macs.map((m) => m.id)) + 1, mac, label, registeredAt: new Date().toISOString() };
  macs.push(entry);
  return ok(macView(entry), 201);
}

function editMac(uid: string, id: number, body: Body): MockResult {
  const entry = macsOf(uid).find((m) => m.id === id);
  if (!entry) return E(404, 'mac_not_found', 'この端末は見つかりません');
  const mac = body.mac === undefined ? entry.mac : normalizeMac(body.mac);
  const label = body.label === undefined ? entry.label : String(body.label).trim();
  if (!validMac(mac)) return E(400, 'invalid_mac', 'MACアドレスの形式が正しくありません');
  if (!label || label.length > 30) return E(400, 'invalid_label', '端末の名前は1〜30文字で入力してください');
  if (macOwner(mac) && mac !== entry.mac) return E(409, 'mac_taken', 'このMACアドレスはすでに登録されています');
  if (mac !== entry.mac) entry.registeredAt = new Date().toISOString();
  entry.mac = mac; entry.label = label;
  if (id === 1) db.users[uid].mac = mac;
  return ok(macView(entry));
}

function pointsView(uid: string) {
  const pts = db.points[uid];
  const t = fmt(startOfDay(new Date()));
  const items = pts.days[t]?.items ?? [];
  return { date: t, today: { items, total: items.reduce((s, i) => s + i.pts, 0) }, total: pts.total };
}

// PATCH /v1/me — 表示名・かくれんぼ
function updateMe(uid: string, body: Body) {
  const u = db.users[uid];
  if ('displayName' in body) {
    const name = String(body.displayName ?? '').trim();
    if (!name || name.length > 20) return E(400, 'invalid_name', '表示名は1〜20文字で入力してください');
    u.name = name;
  }
  if ('hidden' in body) {
    if (typeof body.hidden !== 'boolean') return E(400, 'invalid_hidden', 'hidden は true か false で指定してください');
    u.hidden = body.hidden;
  }
  if ('discoverable' in body) {
    if (typeof body.discoverable !== 'boolean') return E(400, 'invalid_discoverable', 'discoverable は true か false で指定してください');
    u.discoverable = body.discoverable;
  }
  return ok(meView(uid));
}

const friendIdsOf = (uid: string) => db.friendships.filter((f) => f.a === uid || f.b === uid).map((f) => ({ id: f.a === uid ? f.b : f.a, since: f.since }));

// GET /v1/friends — フレンド・申請・ブロック中の一覧
function listFriends(uid: string) {
  const friends = friendIdsOf(uid).filter((o) => !blockedBy(uid, o.id))
    .map((o) => ({ ...publicUser(o.id), friendsSince: o.since, best: bestState(uid, o.id) }));
  const blocked = db.blocks.filter((x) => x.by === uid).map((x) => ({ ...publicUser(x.target), blockedAt: x.at }));
  const incoming = db.friendRequests.filter((r) => r.to === uid && !blockedBy(uid, r.from))
    .map((r) => ({ requestId: r.id, ...publicUser(r.from), createdAt: r.createdAt }));
  const outgoing = db.friendRequests.filter((r) => r.from === uid)
    .map((r) => ({ requestId: r.id, ...publicUser(r.to), createdAt: r.createdAt }));
  return ok({ friends, requests: { incoming, outgoing }, blocked });
}

/**
 * GET /v1/friends/suggestions — 知り合いかも
 * フレンドのフレンドから、ベストフレンドのフレンドか、共通のフレンドが2人以上の人を返す。
 * 本物のバックエンド（backend/src/repo.ts の suggestions）と同じ決まり。
 */
function suggestions(uid: string) {
  const myFriends = friendIdsOf(uid).map((o) => o.id);
  const pendingWith = new Set(db.friendRequests.flatMap((r) => (r.from === uid ? [r.to] : r.to === uid ? [r.from] : [])));
  const found = new Map<string, { mutual: string[]; bestVia?: string }>();

  for (const friend of myFriends) {
    const best = isBest(uid, friend);
    for (const other of friendIdsOf(friend).map((o) => o.id)) {
      if (other === uid || myFriends.includes(other) || pendingWith.has(other)) continue;
      if (blockedBy(uid, other) || blockedBy(other, uid)) continue;
      const user = db.users[other];
      if (!user || user.discoverable === false) continue;
      const entry = found.get(other) ?? { mutual: [] as string[] };
      entry.mutual.push(friend);
      if (best && !entry.bestVia) entry.bestVia = friend;
      found.set(other, entry);
    }
  }

  const list = [...found.entries()]
    // フレンドがまだ1人なら、そのフレンドのフレンドは全員出す（バックエンドと同じ）
    .filter(([, v]) => v.bestVia || v.mutual.length >= 2 || myFriends.length === 1)
    .sort((a, b) => Number(!!b[1].bestVia) - Number(!!a[1].bestVia) || b[1].mutual.length - a[1].mutual.length)
    .slice(0, 10)
    .map(([id, v]) => ({ ...publicUser(id), mutual: v.mutual.map(publicUser) }));
  return ok({ suggestions: list });
}

function makeFriends(a: string, b: string) {
  if (!isFriend(a, b)) db.friendships.push({ a, b, since: new Date().toISOString() });
  db.friendRequests = db.friendRequests.filter((r) => !((r.from === a && r.to === b) || (r.from === b && r.to === a)));
}

// GET /v1/invites/:shareKey — 招待の相手を調べる（申請はしない）
function invite(uid: string, shareKey: string) {
  const target = Object.keys(db.users).find((id) => db.users[id].shareKey === shareKey);
  if (!target || db.users[target].onboarded === false) return E(404, 'share_key_not_found', 'この招待の相手が見つかりません');
  if (target === uid) return E(400, 'self', 'あなた自身の招待です');
  if (blockedBy(uid, target)) return E(409, 'blocked_by_you', 'ブロック中の相手です。先にブロックを解除してください');
  const relation = isFriend(uid, target) ? 'friends'
    : db.friendRequests.some((r) => r.from === uid && r.to === target) ? 'requested'
    : db.friendRequests.some((r) => r.from === target && r.to === uid) ? 'incoming' : 'none';
  return ok({ user: publicUser(target), relation });
}

// POST /v1/friends — QRコード（すぐ成立）かリンク（相手の承認が必要）でフレンド追加
function addFriend(uid: string, body: Body) {
  if (body.via === 'mac' || body.mac !== undefined) return E(400, 'unsupported_friend_method', 'MACでのフレンド検索は終了しました');
  const via = body.via === 'qr' ? 'qr' : 'link';
  // 「知り合いかも」からは共有キーを渡せないので、userId で申請する（link と同じ承認待ち）
  const target = body.via === 'suggestion'
    ? (db.users[String(body.userId ?? '')] ? String(body.userId) : undefined)
    : Object.keys(db.users).find((id) => db.users[id].shareKey === String(body.shareKey ?? '').trim());
  if (!target) {
    if (body.via === 'suggestion') return E(404, 'user_not_found', 'この相手は見つかりません');
    return E(404, 'share_key_not_found', 'このQRコード・リンクは見つかりません');
  }
  if (target === uid) return E(400, 'self', '自分のQRコードです');
  if (blockedBy(uid, target)) return E(409, 'blocked_by_you', 'ブロック中の相手です。フレンド画面で解除してください');
  if (isFriend(uid, target)) return E(409, 'already_friends', `${db.users[target].name}さんとはすでにフレンドです`);
  // 相手にブロックされている場合は、ブロックされていることが分からないよう「申請した」と同じ形で返す
  if (blockedBy(target, uid)) return ok({ status: 'requested', requestId: rand('fr_', 8), user: publicUser(target) }, 202);
  if (via === 'qr' || db.friendRequests.some((r) => r.from === target && r.to === uid)) {
    makeFriends(uid, target);
    return ok({ status: 'friends', user: publicUser(target) }, 201);
  }
  let req = db.friendRequests.find((r) => r.from === uid && r.to === target);
  if (!req) { req = { id: rand('fr_', 8), from: uid, to: target, createdAt: new Date().toISOString() }; db.friendRequests.push(req); }
  return ok({ status: 'requested', requestId: req.id, user: publicUser(target) }, 202);
}

// POST /v1/friend-requests/:id/accept, /decline
function answerRequest(uid: string, id: string, accept: boolean) {
  const req = db.friendRequests.find((r) => r.id === id && r.to === uid);
  if (!req) return E(404, 'request_not_found', '申請が見つかりません');
  if (accept) { makeFriends(uid, req.from); return ok({ status: 'friends', user: publicUser(req.from) }); }
  db.friendRequests = db.friendRequests.filter((r) => r !== req);
  return { status: 204, json: null };
}

const notFriend = (uid: string, other: string) => (!db.users[other] || !isFriend(uid, other) ? E(404, 'friend_not_found', 'フレンドが見つかりません') : null);

// POST /v1/friends/:id/best — ベストフレンドを申請（相手から申請が来ていれば承認）
function requestBest(uid: string, other: string) {
  const err = notFriend(uid, other); if (err) return err;
  if (blockedEither(uid, other)) return E(409, 'blocked', 'ブロック中はベストフレンドにできません');
  if (!isBest(uid, other)) {
    if (db.bestRequests.some((r) => r.from === other && r.to === uid)) {
      db.bestRequests = db.bestRequests.filter((r) => !(r.from === other && r.to === uid));
      db.best.push({ a: uid, b: other, since: new Date().toISOString() });
    } else if (!db.bestRequests.some((r) => r.from === uid && r.to === other)) {
      db.bestRequests.push({ from: uid, to: other, createdAt: new Date().toISOString() });
    }
  }
  return ok({ userId: other, best: bestState(uid, other) });
}

// DELETE /v1/friends/:id/best — 申請の取り消し・届いた申請を断る・ベストフレンドをやめる（どれも片方だけでできる）
function endBest(uid: string, other: string) {
  const err = notFriend(uid, other); if (err) return err;
  db.best = db.best.filter((x) => !samePair(x, uid, other));
  db.bestRequests = db.bestRequests.filter((r) => !((r.from === uid && r.to === other) || (r.from === other && r.to === uid)));
  return ok({ userId: other, best: 'none' });
}

// POST /v1/friends/:id/block — ブロック（フレンドは消さない。お互いの在校が見えなくなる）
function block(uid: string, other: string) {
  const err = notFriend(uid, other); if (err) return err;
  if (!blockedBy(uid, other)) db.blocks.push({ by: uid, target: other, at: new Date().toISOString() });
  endBest(uid, other);
  return ok({ userId: other, blocked: true });
}

// DELETE /v1/friends/:id/block — ブロック解除（元のフレンドに戻る）
function unblock(uid: string, other: string) {
  if (!db.users[other]) return E(404, 'friend_not_found', 'フレンドが見つかりません');
  db.blocks = db.blocks.filter((x) => !(x.by === uid && x.target === other));
  return ok({ userId: other, blocked: false });
}

// POST /v1/checks — 「ポイント獲得（在校確認）」ボタン
function check(uid: string) {
  const now = new Date();
  const today = startOfDay(now);
  const t = fmt(today);
  const me = db.users[uid];
  const c = aggregatePresence(uid);
  const present = c.presence === 'present';
  const rainy = RAINY.includes(db.weather);

  const friends = friendIdsOf(uid).map((o) => o.id).filter((id) => !blockedBy(uid, id))
    .map((id) => ({ userId: id, ...visiblePresence(uid, id) }));

  const pts = db.points[uid];
  const awarded: PointItem[] = [];
  let notice: string | null = null;

  if (!present) {
    notice = c.presence === 'unknown' ? '在校を判定できなかったため、ポイントは入りません' : 'キャンパス外なので、ポイントは入りません';
  } else {
    const day = pts.days[t] ?? (pts.days[t] = { baseDone: false, items: [], matched: {} });
    // その日はじめてのときだけ：来校ベース・連続・雨
    if (!day.baseDone) {
      day.baseDone = true;
      awarded.push({ kind: 'base', label: '来校ベース', pts: P.BASE });
      if (!pts.visitDays.includes(t)) pts.visitDays.push(t);
      const s = streakCount(new Set(pts.visitDays), today);
      const bonus = STREAK.find(([n]) => s >= n);
      if (bonus) awarded.push({ kind: 'streak', label: `${s}日連続で来校`, pts: bonus[1], days: s });
      if (rainy) awarded.push({ kind: 'rain', label: '雨の日ボーナス', pts: P.RAIN });
    }
    // マッチ：押した時点で在校が見えていて、今日まだマッチしていないフレンド
    if (me.hidden) {
      notice = 'かくれんぼ中は、フレンドとのマッチポイントは入りません';
    } else {
      for (const f of friends) {
        if (!f.present || day.matched[f.userId]) continue;
        const name = db.users[f.userId].name;
        const last = pts.lastMatch[f.userId];
        const gap = last ? daysBetween(last, t) : 0;
        const item: PointItem = !last ? { kind: 'first', label: `${name}さんとはじめてマッチ`, pts: P.FIRST }
          : gap >= REUNION_DAYS ? { kind: 'reunion', label: `${name}さんと${gap}日ぶりにマッチ`, pts: P.REUNION, days: gap }
          : { kind: 'match', label: `${name}さんとマッチ`, pts: P.MATCH };
        awarded.push({ ...item, userId: f.userId });
        day.matched[f.userId] = item.kind;
        pts.lastMatch[f.userId] = t;
      }
    }
    day.items.push(...awarded);
    pts.total += awarded.reduce((s, i) => s + i.pts, 0);
  }

  // 画面に出たフレンドのスライムから、届いていたリアクションを渡す
  const reactions: Reaction[] = [];
  db.reactions ??= [];
  for (const f of friends) {
    if (!f.present) continue;
    const r = db.reactions.find((x) => x.from === f.userId && x.to === uid);
    if (!r) continue;
    db.reactions = db.reactions.filter((x) => x !== r);
    if (now.getTime() - new Date(r.at).getTime() <= REACTION.TTL_MS) reactions.push({ userId: f.userId, count: r.count });
  }

  return ok({
    checkedAt: now.toISOString(),
    me: {
      presence: c.presence,
      building: c.buildingKey ? BUILDING_LABELS[c.buildingKey] : null,
      buildingKey: c.buildingKey,
      hidden: me.hidden,
    },
    weather: { condition: db.weather, rainy },
    friends,
    points: { awarded, notice, ...pointsView(uid) },
    reactions,
  });
}

// フレンドへの操作の相手。フレンドでない・自分がブロックしている相手は 404
const friendTarget = (uid: string, other: string) =>
  (!db.users[other] || !isFriend(uid, other) || blockedBy(uid, other) ? E(404, 'friend_not_found', 'フレンドが見つかりません') : null);

// POST /v1/friends/:id/reactions — スライムを連打した回数を送る（相手の画面にこちらのスライムが出たときに届く）
function sendReaction(uid: string, other: string, body: Body) {
  const err = friendTarget(uid, other); if (err) return err;
  const count = body.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > REACTION.MAX) return E(400, 'invalid_count', `回数は1〜${REACTION.MAX}で送ってください`);
  // 相手にブロックされていても、同じ返事をして黙って捨てる
  if (!blockedBy(other, uid)) {
    db.reactions ??= [];
    const r = db.reactions.find((x) => x.from === uid && x.to === other);
    const at = new Date().toISOString();
    if (r) { r.count = Math.min(r.count + count, REACTION.MAX); r.at = at; }
    else db.reactions.push({ from: uid, to: other, count, at });
  }
  return ok({ userId: other, count }, 202);
}

// ---------------------------------------------------------------
// 受け付け口
// ---------------------------------------------------------------
function route(method: string, path: string, _headers: Record<string, string>, body: Body): MockResult {
  const uid = sessionUid;
  if (method === 'POST' && path === '/v1/auth/logout') { setSession(null); return { status: 204, json: null }; }
  if (!uid || !db.users[uid]) return E(401, 'unauthorized', 'Googleでログインしてください');
  if (method === 'GET' && path === '/v1/auth/session') return ok({ displayName: db.users[uid].name, email: db.users[uid].email ?? 'demo@keio.jp', status: db.users[uid].onboarded === false ? 'onboarding' : 'ready' });
  if (method === 'POST' && path === '/v1/auth/logout-all') { setSession(null); return { status: 204, json: null }; }
  if (method === 'POST' && path === '/v1/onboarding') return completeOnboarding(uid, body);
  if (db.users[uid].onboarded === false) return E(403, 'onboarding_required', '初回登録を完了してください');

  if (method === 'GET' && path === '/v1/me') return ok(meView(uid));
  if (method === 'PATCH' && path === '/v1/me') return updateMe(uid, body);
  if (method === 'PUT' && path === '/v1/me/avatar') return updateAvatar(uid, body);
  if (method === 'DELETE' && path === '/v1/me/avatar') { delete db.users[uid].avatar; db.users[uid].avatarSource = 'disabled'; return ok(meView(uid)); }
  if (method === 'GET' && path === '/v1/me/macs') return ok({ macs: macsOf(uid).map(macView), limit: 5 });
  if (method === 'POST' && path === '/v1/me/macs') return addMac(uid, body);
  const macMatch = /^\/v1\/me\/macs\/(\d+)$/.exec(path);
  if (macMatch && method === 'PATCH') return editMac(uid, Number(macMatch[1]), body);
  if (macMatch && method === 'DELETE') {
    const macs = macsOf(uid);
    if (!macs.some((m) => m.id === Number(macMatch[1]))) return E(404, 'mac_not_found', 'この端末は見つかりません');
    if (macs.length <= 1) return E(409, 'last_mac', '最後の端末は削除できません');
    db.users[uid].macs = macs.filter((m) => m.id !== Number(macMatch[1]));
    return { status: 204, json: null };
  }
  if (method === 'POST' && path === '/v1/feedback') {
    const message = String(body.message ?? '').trim();
    if (message.length < 2 || message.length > 1000) return E(400, 'invalid_message', '2〜1000文字で書いてください');
    feedback.push({ uid, message, at: new Date().toISOString() });
    const today = feedback.filter((f) => f.uid === uid && f.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
    if (today > 5) return E(429, 'too_many', '今日はもう送れません（1日5件まで）。明日またお願いします');
    return ok({ remaining: 5 - today }, 201);
  }
  const inviteMatch = /^\/v1\/invites\/([^/]+)$/.exec(path);
  if (inviteMatch && method === 'GET') return invite(uid, decodeURIComponent(inviteMatch[1]));
  if (method === 'GET' && path === '/v1/points') return ok(pointsView(uid));
  if (method === 'POST' && path === '/v1/checks') return check(uid);
  if (method === 'GET' && path === '/v1/friends') return listFriends(uid);
  if (method === 'GET' && path === '/v1/friends/suggestions') return suggestions(uid);
  if (method === 'POST' && path === '/v1/friends') return addFriend(uid, body);

  let m = /^\/v1\/friend-requests\/([\w-]+)\/(accept|decline)$/.exec(path);
  if (m && method === 'POST') return answerRequest(uid, m[1], m[2] === 'accept');

  m = /^\/v1\/friends\/([\w-]+)\/(best|block|reactions)$/.exec(path);
  if (m) {
    if (m[2] === 'reactions' && method === 'POST') return sendReaction(uid, m[1], body);
    if (m[2] === 'best' && method === 'POST') return requestBest(uid, m[1]);
    if (m[2] === 'best' && method === 'DELETE') return endBest(uid, m[1]);
    if (m[2] === 'block' && method === 'POST') return block(uid, m[1]);
    if (m[2] === 'block' && method === 'DELETE') return unblock(uid, m[1]);
  }
  return E(404, 'not_found', `${method} ${path} はありません`);
}

async function handle(method: string, path: string, headers: Record<string, string>, body?: Body): Promise<MockResult> {
  const r = route(method, path, headers, body ?? {});
  if (method !== 'GET') save();
  return r;
}

// ---------------------------------------------------------------
// デモ操作（本物のバックエンドには存在しない）
// ---------------------------------------------------------------
export interface SimPerson extends Campus {
  userId: string;
  name: string;
  mac: string;
  shareKey: string;
  hidden: boolean;
  relation: 'あなた' | 'フレンド' | 'ベストフレンド' | 'ブロック中' | '申請が届いている' | '申請中' | 'フレンドではない';
}

const sim = {
  signedIn() { return !!sessionUid; },
  currentUserId() { return sessionUid; },
  login() { setSession('u_me'); },
  macStates(uid: string) { return macsOf(uid).map((entry) => ({ ...entry, ...macCampus(uid, entry.id) })); },
  setMacCampus(uid: string, id: number, patch: Partial<Campus>) {
    db.macCampus ??= {};
    db.macCampus[`${uid}:${id}`] = { ...macCampus(uid, id), ...patch };
    save();
  },
  startNewAccount() {
    const now = new Date().toISOString();
    db.users.u_new = { name: '山田 太郎', mac: '', shareKey: '', hidden: false, avatar: DEMO_GOOGLE_AVATAR, avatarSource: 'google',
      macRegisteredAt: now, createdAt: now, email: 'new@keio.jp', macs: [], onboarded: false };
    db.campus.u_new = { connected: false, buildingKey: 'kappa' };
    db.points.u_new = { total: 0, visitDays: [], lastMatch: {}, days: {} };
    setSession('u_new'); save();
  },
  state(currentUid: string | null): { people: SimPerson[]; weather: string } {
    const people = Object.keys(db.users).map((id): SimPerson => {
      let relation: SimPerson['relation'] = 'フレンドではない';
      if (id === currentUid) relation = 'あなた';
      else if (currentUid && blockedBy(currentUid, id)) relation = 'ブロック中';
      else if (currentUid && isBest(currentUid, id)) relation = 'ベストフレンド';
      else if (currentUid && isFriend(currentUid, id)) relation = 'フレンド';
      else if (currentUid && db.friendRequests.some((r) => r.from === id && r.to === currentUid)) relation = '申請が届いている';
      else if (currentUid && db.friendRequests.some((r) => r.from === currentUid && r.to === id)) relation = '申請中';
      const u = db.users[id];
      return { userId: id, name: u.name, mac: u.mac, shareKey: u.shareKey, hidden: u.hidden, relation, ...db.campus[id] };
    });
    return { people, weather: db.weather };
  },
  setCampus(uid: string, patch: Partial<Campus>) {
    const c = db.campus[uid]; if (!c) return;
    if (typeof patch.connected === 'boolean') c.connected = patch.connected;
    if (patch.buildingKey && BUILDINGS.includes(patch.buildingKey)) c.buildingKey = patch.buildingKey;
    save();
  },
  setHidden(uid: string, hidden: boolean) { if (db.users[uid]) { db.users[uid].hidden = hidden; save(); } },
  setWeather(condition: string) { db.weather = condition; save(); },
  // 相手がこちらの招待リンクを開いた（こちらに申請が届く）
  openMyLink(from: string, currentUid: string) { addFriend(from, { shareKey: db.users[currentUid].shareKey, via: 'link' }); save(); },
  // 相手がベストフレンドを申請した
  requestBestFrom(from: string, currentUid: string) { requestBest(from, currentUid); save(); },
  // 相手がこちらのスライムを連打した（相手のスライムがこちらの画面に出たときに届く）
  reactFrom(from: string, currentUid: string, count: number) { sendReaction(from, currentUid, { count }); save(); },
  reset() { db = seed(); setSession('u_me'); save(); },
};

export const mockBackend = { handle, sim };
