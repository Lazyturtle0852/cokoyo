// アプリのバックエンドの模擬
//
// 本物のバックエンドができるまで、ブラウザの中でAPIの代わりをする。
// パス・受け取るもの・返すものは docs/api-for-backend.md と同じ。
// 本物に繋ぐときは使われない（src/config.ts）。
//
// 中身は「バックエンドのデータ」と「大学側APIの模擬（キャンパスの様子）」の2つ。
// 状態はブラウザに保存するので、ページを開き直しても続きから使える。

import type { BestState, PointItem, PointKind } from './types';

const STORE_KEY = 'cokoyo-mock-backend:v1';

// ---------------------------------------------------------------
// ポイントの決まり（10pt = 1円）
//
// 普通の日（フレンド5人・雨でもはじめてでもない日）で 55〜70pt（5.5〜7円）、
// 月16日通って 88〜112円になる値。backend/src/points.ts と同じ値にすること。
// ---------------------------------------------------------------
const P = { BASE: 20, RAIN: 10, MATCH: 6, REUNION: 50, FIRST: 70, CAP: 10 };
const STREAK: [number, number][] = [[14, 20], [7, 10], [3, 5]]; // [連続日数, 加算pt]
const REUNION_DAYS = 30;
const RAINY = ['drizzle', 'rain', 'shower', 'thunderstorm', 'sleet', 'snow'];
export const BUILDINGS = ['κ館', 'ε館', 'ι館', 'ο館', 'Δ館', 'τ館', 'Ω館', 'メディアセンター'];

// ---------------------------------------------------------------
// データの形（バックエンドの中だけで使う）
// ---------------------------------------------------------------
interface DbUser { name: string; mac: string; shareKey: string; token: string | null; hidden: boolean; macRegisteredAt: string; createdAt: string }
interface Campus { connected: boolean; building: string }
interface Ledger {
  total: number;
  visitDays: string[];
  lastMatch: Record<string, string>;
  days: Record<string, { baseDone: boolean; items: PointItem[]; matched: Record<string, PointKind> }>;
}
interface Db {
  users: Record<string, DbUser>;
  campus: Record<string, Campus>;
  friendships: { a: string; b: string; since: string }[];
  friendRequests: { id: string; from: string; to: string; createdAt: string }[];
  best: { a: string; b: string; since: string }[];
  bestRequests: { from: string; to: string; createdAt: string }[];
  blocks: { by: string; target: string; at: string }[];
  weather: string;
  points: Record<string, Ledger>;
}

export interface MockResult { status: number; json: unknown }

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
const DEMO_TOKEN = 'dt_demo_me';

function seed(): Db {
  const today = startOfDay(new Date());
  const wd = prevWeekdays(today, 4); // 昨日までの平日4日 → 今日来ると5日連続
  const ago = (n: number) => addDays(today, -n).toISOString();
  const user = (name: string, mac: string, shareKey: string, extra: Partial<DbUser> = {}): DbUser => ({
    name, mac, shareKey, token: null, hidden: false, macRegisteredAt: ago(20), createdAt: ago(30), ...extra,
  });
  const empty = (): Ledger => ({ total: 0, visitDays: [], lastMatch: {}, days: {} });

  return {
    users: {
      u_me:        user('ゆうき', 'a2:3f:9c:1b:7e:44', 'sk_m8qe4tz2', { token: DEMO_TOKEN, macRegisteredAt: ago(12) }),
      u_sato:      user('佐藤',   '5c:e1:08:77:3a:b2', 'sk_s3nv7kpa'),
      u_tanaka:    user('田中',   'd6:4b:92:0f:c8:13', 'sk_t9wd2hxe'),
      u_suzuki:    user('鈴木',   '7e:a0:5d:e6:21:9f', 'sk_z4rc8mfu', { hidden: true }),
      u_yamada:    user('山田',   '3a:f7:c4:58:0b:6e', 'sk_y6hp3bnq'),
      u_takahashi: user('高橋',   '9e:12:6b:d0:44:c7', 'sk_k2xa5gvw'),
      u_ito:       user('伊藤',   'f2:58:a1:3c:9d:06', 'sk_i7jt4qzs'),
    },
    campus: {
      u_me:        { connected: false, building: 'κ館' },
      u_sato:      { connected: true,  building: 'κ館' },
      u_tanaka:    { connected: true,  building: 'ε館' },
      u_suzuki:    { connected: true,  building: 'Ω館' },
      u_yamada:    { connected: true,  building: 'Δ館' },
      u_takahashi: { connected: false, building: 'ι館' },
      u_ito:       { connected: true,  building: 'τ館' },
    },
    friendships: [
      { a: 'u_me', b: 'u_sato',   since: ago(90) },
      { a: 'u_me', b: 'u_tanaka', since: ago(120) },
      { a: 'u_me', b: 'u_suzuki', since: ago(60) },
      { a: 'u_me', b: 'u_ito',    since: ago(200) },
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
      u_sato: empty(), u_tanaka: empty(), u_suzuki: empty(), u_yamada: empty(), u_takahashi: empty(), u_ito: empty(),
    },
  };
}

let db: Db = (() => {
  try { const s = localStorage.getItem(STORE_KEY); if (s) return JSON.parse(s) as Db; } catch { /* 保存できない環境 */ }
  return seed();
})();
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* 保存できない環境 */ } };

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
function visiblePresence(viewer: string, target: string): { present: boolean; building?: string } {
  const c = db.campus[target];
  const u = db.users[target];
  if (!c || !c.connected || u.hidden || blockedEither(viewer, target) || !isFriend(viewer, target)) return { present: false };
  return isBest(viewer, target) ? { present: true, building: c.building } : { present: true };
}

const publicUser = (uid: string) => ({ userId: uid, displayName: db.users[uid].name });
const maskMac = (mac: string) => { const p = mac.split(':'); return `${p[0]}:${p[1]}:••:••:••:${p[5]}`; };
const normalizeMac = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/-/g, ':');
const validMac = (s: string) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s);

// ---------------------------------------------------------------
// API本体
// ---------------------------------------------------------------
type Body = Record<string, unknown>;
const E = (status: number, code: string, message: string): MockResult => ({ status, json: { error: { code, message } } });
const ok = (json: unknown, status = 200): MockResult => ({ status, json });

function meView(uid: string) {
  const u = db.users[uid];
  return { userId: uid, displayName: u.name, shareKey: u.shareKey, hidden: u.hidden, macMasked: maskMac(u.mac), macRegisteredAt: u.macRegisteredAt };
}

function pointsView(uid: string) {
  const pts = db.points[uid];
  const t = fmt(startOfDay(new Date()));
  const items = pts.days[t]?.items ?? [];
  return { date: t, today: { items, total: items.reduce((s, i) => s + i.pts, 0) }, total: pts.total };
}

// POST /v1/users — はじめての登録（ログインなし。端末トークンを返す）
function createUser(body: Body) {
  const name = String(body.displayName ?? '').trim();
  const mac = normalizeMac(body.mac);
  if (!name || name.length > 20) return E(400, 'invalid_name', '表示名は1〜20文字で入力してください');
  if (!validMac(mac)) return E(400, 'invalid_mac', 'MACアドレスの形が正しくありません（例：a2:3f:9c:1b:7e:44）');
  if (Object.values(db.users).some((u) => u.mac === mac)) return E(409, 'mac_taken', 'このMACアドレスはすでに登録されています');
  const uid = rand('u_', 8);
  const now = new Date().toISOString();
  db.users[uid] = { name, mac, shareKey: rand('sk_', 8), token: rand('dt_', 20), hidden: false, macRegisteredAt: now, createdAt: now };
  db.campus[uid] = { connected: false, building: 'κ館' };
  db.points[uid] = { total: 0, visitDays: [], lastMatch: {}, days: {} };
  return ok({ ...meView(uid), deviceToken: db.users[uid].token }, 201);
}

// POST /v1/sessions — 登録済みのMACをこの端末に引き継ぐ
function restoreSession(body: Body) {
  const mac = normalizeMac(body.mac);
  if (!validMac(mac)) return E(400, 'invalid_mac', 'MACアドレスの形が正しくありません（例：a2:3f:9c:1b:7e:44）');
  const uid = Object.keys(db.users).find((id) => db.users[id].mac === mac);
  if (!uid) return E(404, 'mac_not_registered', 'このMACアドレスはまだ登録されていません');
  db.users[uid].token = rand('dt_', 20); // 前の端末は使えなくなる
  save();
  return ok({ ...meView(uid), deviceToken: db.users[uid].token });
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
  return ok(meView(uid));
}

// PUT /v1/me/mac — MACアドレスの登録し直し
function updateMac(uid: string, body: Body) {
  const mac = normalizeMac(body.mac);
  if (!validMac(mac)) return E(400, 'invalid_mac', 'MACアドレスの形が正しくありません（例：a2:3f:9c:1b:7e:44）');
  if (Object.entries(db.users).some(([id, u]) => id !== uid && u.mac === mac)) return E(409, 'mac_taken', 'このMACアドレスはすでに登録されています');
  db.users[uid].mac = mac;
  db.users[uid].macRegisteredAt = new Date().toISOString();
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

function makeFriends(a: string, b: string) {
  if (!isFriend(a, b)) db.friendships.push({ a, b, since: new Date().toISOString() });
  db.friendRequests = db.friendRequests.filter((r) => !((r.from === a && r.to === b) || (r.from === b && r.to === a)));
}

// POST /v1/friends — QRコード（すぐ成立）かリンク（相手の承認が必要）でフレンド追加
function addFriend(uid: string, body: Body) {
  const via = body.via === 'qr' ? 'qr' : body.via === 'mac' ? 'mac' : 'link';
  let target: string | undefined;
  if (via === 'mac') {
    const mac = normalizeMac(body.mac);
    if (!validMac(mac)) return E(400, 'invalid_mac', 'MACアドレスの形式が正しくありません');
    target = Object.keys(db.users).find((id) => db.users[id].mac === mac);
    if (!target) return E(404, 'mac_not_registered', 'このMACアドレスの人は、まだ登録していません');
  } else {
    const key = String(body.shareKey ?? '').trim();
    target = Object.keys(db.users).find((id) => db.users[id].shareKey === key);
    if (!target) return E(404, 'share_key_not_found', 'このQRコード・リンクは見つかりません');
  }
  if (target === uid) return E(400, 'self', via === 'mac' ? '自分のMACアドレスです' : '自分のQRコードです');
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
  const c = db.campus[uid];
  const present = !!c?.connected;
  const rainy = RAINY.includes(db.weather);

  const friends = friendIdsOf(uid).map((o) => o.id).filter((id) => !blockedBy(uid, id))
    .map((id) => ({ userId: id, ...visiblePresence(uid, id) }));

  const pts = db.points[uid];
  const awarded: PointItem[] = [];
  let notice: string | null = null;

  if (!present) {
    notice = 'キャンパス外なので、ポイントは入りません';
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
      let count = Object.keys(day.matched).length;
      for (const f of friends) {
        if (!f.present || day.matched[f.userId]) continue;
        if (count >= P.CAP) { notice = 'フレンドとのマッチポイントは1日10人までです'; break; }
        const name = db.users[f.userId].name;
        const last = pts.lastMatch[f.userId];
        const gap = last ? daysBetween(last, t) : 0;
        const item: PointItem = !last ? { kind: 'first', label: `${name}さんとはじめてマッチ`, pts: P.FIRST }
          : gap >= REUNION_DAYS ? { kind: 'reunion', label: `${name}さんと${gap}日ぶりにマッチ`, pts: P.REUNION, days: gap }
          : { kind: 'match', label: `${name}さんとマッチ`, pts: P.MATCH };
        awarded.push({ ...item, userId: f.userId });
        day.matched[f.userId] = item.kind;
        pts.lastMatch[f.userId] = t;
        count++;
      }
    }
    day.items.push(...awarded);
    pts.total += awarded.reduce((s, i) => s + i.pts, 0);
  }

  return ok({
    checkedAt: now.toISOString(),
    me: { present, building: present ? c.building : null, hidden: me.hidden },
    weather: { condition: db.weather, rainy },
    friends,
    points: { awarded, notice, ...pointsView(uid) },
  });
}

// ---------------------------------------------------------------
// 受け付け口
// ---------------------------------------------------------------
function userFromToken(headers: Record<string, string>) {
  const m = /^Bearer\s+(\S+)$/.exec(headers.Authorization ?? headers.authorization ?? '');
  if (!m) return null;
  return Object.keys(db.users).find((id) => db.users[id].token === m[1]) ?? null;
}

function route(method: string, path: string, headers: Record<string, string>, body: Body): MockResult {
  if (method === 'POST' && path === '/v1/users') return createUser(body);
  if (method === 'POST' && path === '/v1/sessions') return restoreSession(body);

  const uid = userFromToken(headers);
  if (!uid) return E(401, 'unauthorized', 'この端末は登録されていません。登録からやり直してください');

  if (method === 'GET' && path === '/v1/me') return ok(meView(uid));
  if (method === 'PATCH' && path === '/v1/me') return updateMe(uid, body);
  if (method === 'PUT' && path === '/v1/me/mac') return updateMac(uid, body);
  if (method === 'GET' && path === '/v1/points') return ok(pointsView(uid));
  if (method === 'POST' && path === '/v1/checks') return check(uid);
  if (method === 'GET' && path === '/v1/friends') return listFriends(uid);
  if (method === 'POST' && path === '/v1/friends') return addFriend(uid, body);

  let m = /^\/v1\/friend-requests\/([\w-]+)\/(accept|decline)$/.exec(path);
  if (m && method === 'POST') return answerRequest(uid, m[1], m[2] === 'accept');

  m = /^\/v1\/friends\/([\w-]+)\/(best|block)$/.exec(path);
  if (m) {
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
  demoToken: DEMO_TOKEN,
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
    if (patch.building && BUILDINGS.includes(patch.building)) c.building = patch.building;
    save();
  },
  setHidden(uid: string, hidden: boolean) { if (db.users[uid]) { db.users[uid].hidden = hidden; save(); } },
  setWeather(condition: string) { db.weather = condition; save(); },
  // 相手がこちらの招待リンクを開いた（こちらに申請が届く）
  openMyLink(from: string, currentUid: string) { addFriend(from, { shareKey: db.users[currentUid].shareKey, via: 'link' }); save(); },
  // 相手がベストフレンドを申請した
  requestBestFrom(from: string, currentUid: string) { requestBest(from, currentUid); save(); },
  userIdForToken(token: string | null) { return token ? Object.keys(db.users).find((id) => db.users[id].token === token) ?? null : null; },
  reset() { db = seed(); save(); },
};

export const mockBackend = { handle, sim };
