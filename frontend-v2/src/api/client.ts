// バックエンドとの通信
//
// 画面はこのファイルの api.* だけを使う。
// 接続先は src/config.ts で決まる（模擬バックエンドか、本物のURLか）。
// パス・受け取るもの・返すものは docs/api-for-backend.md と src/api/types.ts を見る。

import { config, useMockBackend } from '../config';
import { mockBackend } from './mockBackend';
import type {
  AddFriendResponse, ApiErrorBody, BestResponse, BlockResponse, CheckResponse,
  FriendsResponse, Me, PointsResponse, RegisterResponse, UserRef,
} from './types';

// ---------------------------------------------------------------
// この端末に保存するもの：端末トークンだけ（ログインなし）
// ---------------------------------------------------------------
const DEVICE_KEY = 'cokoyo-device:v1';
let memoryToken: string | null | undefined;

export const device = {
  get token(): string | null {
    try { const s = localStorage.getItem(DEVICE_KEY); if (s !== null) return (JSON.parse(s) as { token: string | null }).token; } catch { /* 保存できない環境 */ }
    return memoryToken ?? null;
  },
  // 一度も使っていない端末か（模擬バックエンドでは、登録済みのサンプルから始めるために使う）
  get untouched(): boolean {
    try { return localStorage.getItem(DEVICE_KEY) === null && memoryToken === undefined; } catch { return memoryToken === undefined; }
  },
  set(token: string | null) {
    memoryToken = token;
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ token })); } catch { /* 保存できない環境 */ }
  },
  clear() { this.set(null); },
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

async function request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
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
      });
      status = res.status;
      json = status === 204 ? null : await res.json().catch(() => null);
    } catch (e) {
      push({ method, path, body, status: 0, json: { error: { message: String((e as Error).message ?? e) } }, withToken: !!token });
      throw new ApiError('バックエンドに接続できません。URLとCORSの設定を確認してください', 0);
    }
  }

  push({ method, path, body, status, json, withToken: !!token });

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
  getMe: () => request<Me>('GET', '/v1/me'),
  updateMe: (patch: { displayName?: string; hidden?: boolean }) => request<Me>('PATCH', '/v1/me', patch),
  updateMac: (mac: string) => request<Me>('PUT', '/v1/me/mac', { mac }),

  // 在校確認とポイント
  check: () => request<CheckResponse>('POST', '/v1/checks'),
  getPoints: () => request<PointsResponse>('GET', '/v1/points'),

  // フレンド
  getFriends: () => request<FriendsResponse>('GET', '/v1/friends'),
  addFriend: (shareKey: string, via: 'qr' | 'link') => request<AddFriendResponse>('POST', '/v1/friends', { shareKey, via }),
  acceptRequest: (requestId: string) => request<{ status: 'friends'; user: UserRef }>('POST', `/v1/friend-requests/${id(requestId)}/accept`),
  declineRequest: (requestId: string) => request<null>('POST', `/v1/friend-requests/${id(requestId)}/decline`),
  requestBest: (userId: string) => request<BestResponse>('POST', `/v1/friends/${id(userId)}/best`),
  endBest: (userId: string) => request<BestResponse>('DELETE', `/v1/friends/${id(userId)}/best`),
  block: (userId: string) => request<BlockResponse>('POST', `/v1/friends/${id(userId)}/block`),
  unblock: (userId: string) => request<BlockResponse>('DELETE', `/v1/friends/${id(userId)}/block`),
};
