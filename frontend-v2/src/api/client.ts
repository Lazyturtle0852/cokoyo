// バックエンドとの通信
//
// 画面はこのファイルの api.* だけを使う。
// 接続先は src/config.ts で決まる（模擬バックエンドか、本物のURLか）。
// パス・受け取るもの・返すものは docs/api-for-backend.md と src/api/types.ts を見る。

import { config, useMockBackend } from '../config';
import { mockBackend } from './mockBackend';
import type {
  AddFriendResponse, ApiErrorBody, BestResponse, BlockResponse, CheckResponse,
  DebugDbResponse, FriendsResponse, Me, PointsResponse, ReactionResponse, RegisterResponse, UserRef,
} from './types';

// ---------------------------------------------------------------
// この端末に保存するもの：端末トークンだけ（ログインなし）
// ---------------------------------------------------------------
const DEVICE_KEY = 'cokoyo-device:v1';
interface Saved { token: string | null; mac?: string }
let memory: Saved | undefined;

const read = (): Saved | undefined => {
  try { const s = localStorage.getItem(DEVICE_KEY); if (s !== null) return JSON.parse(s) as Saved; } catch { /* 保存できない環境 */ }
  return memory;
};
const write = (v: Saved) => {
  memory = v;
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(v)); } catch { /* 保存できない環境 */ }
};

export const device = {
  get token(): string | null { return read()?.token ?? null; },
  /**
   * 登録に使ったMACアドレス。
   *
   * 端末トークンが消えても（iPhone の Safari は、しばらく開かないと localStorage を消す）、
   * これが残っていれば黙って登録し直せる。MACは持ち主の端末に置くだけで、外には出さない。
   */
  get mac(): string { return read()?.mac ?? ''; },
  // 一度も使っていない端末か（模擬バックエンドでは、登録済みのサンプルから始めるために使う）
  get untouched(): boolean {
    try { return localStorage.getItem(DEVICE_KEY) === null && memory === undefined; } catch { return memory === undefined; }
  },
  set(token: string | null) { write({ ...read(), token }); },
  setMac(mac: string) { write({ token: read()?.token ?? null, mac }); },
  /** 端末トークンだけ捨てる。MACは残すので、次の通信で黙って入り直せる */
  clear() { write({ ...read(), token: null }); },
  /** ログアウト。MACの覚えも消す */
  forget() { write({ token: null }); },
};

// ---------------------------------------------------------------
// 通信の記録（画面右の「バックエンドとの通信」に出す）
// ---------------------------------------------------------------
export interface CallRecord {
  method: string;
  path: string;
  body?: unknown;
  status: number;
  json: unknown;
  withToken: boolean;
}

let log: { actionName: string; calls: CallRecord[] } = { actionName: '', calls: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export const callLog = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  get: () => log,
  begin(actionName: string) { log = { actionName, calls: [] }; emit(); },
};

const push = (c: CallRecord) => { log = { ...log, calls: [...log.calls, c] }; emit(); };

// ---------------------------------------------------------------
// 送る
// ---------------------------------------------------------------
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * silent: 「バックエンドとの通信」に記録しない。
 * 説明用ページが裏で叩くもの（DBの中身）に使う。直前の操作の記録を汚さないため。
 */
/**
 * 端末トークンが効かなくなったとき、覚えているMACアドレスで黙って登録し直す。
 * 一度でも登録した端末なら、MACアドレスの入れ直しを求めない。
 */
let recovering: Promise<boolean> | null = null;
function recoverSession(): Promise<boolean> {
  recovering ??= (async () => {
    const mac = device.mac;
    if (!mac || useMockBackend) return false;
    try {
      const r = await request<RegisterResponse>('POST', '/v1/sessions', { mac }, true, true);
      device.set(r.deviceToken);
      return true;
    } catch { return false; } finally { setTimeout(() => { recovering = null; }, 0); }
  })();
  return recovering;
}

async function request<T>(method: string, path: string, body?: Record<string, unknown>, silent = false, noRetry = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = device.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  let status: number;
  let json: unknown;
  if (useMockBackend) {
    await wait(160); // 通信している感じを出す
    ({ status, json } = await mockBackend.handle(method, path, headers, body));
  } else {
    try {
      const res = await fetch(config.apiBaseUrl.replace(/\/$/, '') + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        // 端末トークンのクッキー（localStorage が消えても残る控え）を一緒に送る
        credentials: 'include',
      });
      status = res.status;
      json = status === 204 ? null : await res.json().catch(() => null);
    } catch (e) {
      if (!silent) push({ method, path, body, status: 0, json: { error: { message: String((e as Error).message ?? e) } }, withToken: !!token });
      throw new ApiError('バックエンドに接続できません。URLとCORSの設定を確認してください', 0);
    }
  }

  if (status >= 400) {
    // 覚えているMACアドレスで登録し直せるなら、黙ってやり直す
    if (status === 401 && !noRetry && await recoverSession()) {
      return request<T>(method, path, body, silent, true);
    }
  }

  if (!silent) push({ method, path, body, status, json, withToken: !!token });

  if (status >= 400) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiError(err?.message ?? `通信に失敗しました（${status}）`, status, err?.code);
  }
  return json as T;
}

const id = encodeURIComponent;

export const api = {
  // 登録・自分
  register: (displayName: string, mac: string) => request<RegisterResponse>('POST', '/v1/users', { displayName, mac }),
  // 登録済みのMACを、この端末に引き継ぐ（アプリを入れ直したとき）
  restore: (mac: string) => request<RegisterResponse>('POST', '/v1/sessions', { mac }),
  /** ログアウト（この端末の覚えを消す。登録そのものは残る） */
  logout: () => request<null>('DELETE', '/v1/sessions'),
  // silent: 画面の操作ではなく、裏で様子を見にいくとき（「バックエンドとの通信」に残さない）
  getMe: (silent = false) => request<Me>('GET', '/v1/me', undefined, silent),
  updateMe: (patch: { displayName?: string; hidden?: boolean }) => request<Me>('PATCH', '/v1/me', patch),
  updateMac: (mac: string) => request<Me>('PUT', '/v1/me/mac', { mac }),
  // アイコンの画像（128px四方に縮めた data URL）
  updateAvatar: (image: string) => request<Me>('PUT', '/v1/me/avatar', { image }),
  removeAvatar: () => request<Me>('DELETE', '/v1/me/avatar'),

  // 在校確認とポイント
  check: () => request<CheckResponse>('POST', '/v1/checks'),
  getPoints: (silent = false) => request<PointsResponse>('GET', '/v1/points', undefined, silent),

  // フレンド
  getFriends: (silent = false) => request<FriendsResponse>('GET', '/v1/friends', undefined, silent),
  addFriend: (shareKey: string, via: 'qr' | 'link') => request<AddFriendResponse>('POST', '/v1/friends', { shareKey, via }),
  // 共有キーを渡せないとき用。相手の承認でフレンドになる（link と同じ扱い）
  addFriendByMac: (mac: string) => request<AddFriendResponse>('POST', '/v1/friends', { mac, via: 'mac' }),
  acceptRequest: (requestId: string) => request<{ status: 'friends'; user: UserRef }>('POST', `/v1/friend-requests/${id(requestId)}/accept`),
  declineRequest: (requestId: string) => request<null>('POST', `/v1/friend-requests/${id(requestId)}/decline`),
  requestBest: (userId: string) => request<BestResponse>('POST', `/v1/friends/${id(userId)}/best`),
  endBest: (userId: string) => request<BestResponse>('DELETE', `/v1/friends/${id(userId)}/best`),
  block: (userId: string) => request<BlockResponse>('POST', `/v1/friends/${id(userId)}/block`),
  unblock: (userId: string) => request<BlockResponse>('DELETE', `/v1/friends/${id(userId)}/block`),

  // スライムの連打（相手の画面にあなたのスライムが出たときに届く）
  react: (userId: string, count: number) => request<ReactionResponse>('POST', `/v1/friends/${id(userId)}/reactions`, { count }),

  // 説明用ページ（/explain）だけが使う。アプリ本体は使わない。
  debugDb: () => request<DebugDbResponse>('GET', '/v1/debug/db', undefined, true),
};
