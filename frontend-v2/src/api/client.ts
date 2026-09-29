// バックエンドとの通信
//
// 画面はこのファイルの api.* だけを使う。
// 接続先は src/config.ts で決まる（模擬バックエンドか、本物のURLか）。
// パス・受け取るもの・返すものは docs/api-for-backend.md と src/api/types.ts を見る。

import { config, useMockBackend } from '../config';
import { pendingInvite } from '../app/invite';
import { mockBackend } from './mockBackend';
import type {
  AddFriendResponse, ApiErrorBody, BestResponse, BlockResponse, CheckResponse,
  DebugDbResponse, FeedbackResponse, SuggestionsResponse, FriendsResponse, MacAddressView, Me, PointsResponse, ReactionResponse, UserRef,
} from './types';

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
async function request<T>(method: string, path: string, body?: Record<string, unknown>, silent = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const withSession = useMockBackend ? mockBackend.sim.signedIn() : true;

  let status: number;
  let json: unknown;
  if (useMockBackend) {
    await wait(160); // 通信している感じを出す
    ({ status, json } = await mockBackend.handle(method, path, headers, body));
  } else {
    try {
      const res = await fetch(config.apiBaseUrl.replace(/\/$/, '') + path, {
        method, headers, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined,
      });
      status = res.status;
      json = status === 204 ? null : await res.json().catch(() => null);
    } catch (e) {
      if (!silent) push({ method, path, body, status: 0, json: { error: { message: String((e as Error).message ?? e) } }, withToken: withSession });
      throw new ApiError('バックエンドに接続できません。同じサイトのAPI設定を確認してください', 0);
    }
  }

  if (!silent) push({ method, path, body, status, json, withToken: withSession });

  if (status >= 400) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiError(err?.message ?? `通信に失敗しました（${status}）`, status, err?.code);
  }
  return json as T;
}

const id = encodeURIComponent;

export const api = {
  // 認証・初回登録
  getSession: () => request<{ email: string; displayName: string; status: 'onboarding' | 'ready' }>('GET', '/v1/auth/session'),
  beginLogin: () => {
    if (useMockBackend) { mockBackend.sim.login(); window.location.reload(); return; }
    const invite = pendingInvite();
    const url = `${config.apiBaseUrl.replace(/\/$/, '')}/v1/auth/google${invite ? `?add=${encodeURIComponent(invite)}` : ''}`;
    window.location.assign(url);
  },
  logout: () => request<null>('POST', '/v1/auth/logout'),
  logoutAll: () => request<null>('POST', '/v1/auth/logout-all'),
  completeOnboarding: (displayName: string, mac: string, label: string) =>
    request<Me>('POST', '/v1/onboarding', { displayName, mac, label }),
  getMe: (silent = false) => request<Me>('GET', '/v1/me', undefined, silent),
  updateMe: (patch: { displayName?: string; hidden?: boolean; discoverable?: boolean }) => request<Me>('PATCH', '/v1/me', patch),
  updateAvatar: (image: string) => request<Me>('PUT', '/v1/me/avatar', { image }),
  removeAvatar: () => request<Me>('DELETE', '/v1/me/avatar'),
  getMacs: () => request<{ macs: MacAddressView[]; limit: number }>('GET', '/v1/me/macs'),
  addMac: (mac: string, label: string) => request<MacAddressView>('POST', '/v1/me/macs', { mac, label }),
  editMac: (id: number, patch: { mac?: string; label?: string }) =>
    request<MacAddressView>('PATCH', `/v1/me/macs/${id}`, patch),
  deleteMac: (id: number) => request<null>('DELETE', `/v1/me/macs/${id}`),

  // 在校確認とポイント
  check: () => request<CheckResponse>('POST', '/v1/checks'),
  getPoints: (silent = false) => request<PointsResponse>('GET', '/v1/points', undefined, silent),

  // フレンド
  getFriends: (silent = false) => request<FriendsResponse>('GET', '/v1/friends', undefined, silent),
  // 知り合いかも（フレンドのフレンド）
  getSuggestions: (silent = false) => request<SuggestionsResponse>('GET', '/v1/friends/suggestions', undefined, silent),
  // おすすめから申請する（相手の承認でフレンドになる）
  addFriendById: (userId: string) => request<AddFriendResponse>('POST', '/v1/friends', { userId, via: 'suggestion' }),
  addFriend: (shareKey: string, via: 'qr' | 'link') => request<AddFriendResponse>('POST', '/v1/friends', { shareKey, via }),
  acceptRequest: (requestId: string) => request<{ status: 'friends'; user: UserRef }>('POST', `/v1/friend-requests/${id(requestId)}/accept`),
  declineRequest: (requestId: string) => request<null>('POST', `/v1/friend-requests/${id(requestId)}/decline`),
  requestBest: (userId: string) => request<BestResponse>('POST', `/v1/friends/${id(userId)}/best`),
  endBest: (userId: string) => request<BestResponse>('DELETE', `/v1/friends/${id(userId)}/best`),
  block: (userId: string) => request<BlockResponse>('POST', `/v1/friends/${id(userId)}/block`),
  unblock: (userId: string) => request<BlockResponse>('DELETE', `/v1/friends/${id(userId)}/block`),

  // スライムの連打（相手の画面にあなたのスライムが出たときに届く）
  react: (userId: string, count: number) => request<ReactionResponse>('POST', `/v1/friends/${id(userId)}/reactions`, { count }),

  // 説明用ページ（/explain）だけが使う。アプリ本体は使わない。
  // 問い合わせ・ご意見（アプリの中から送る）
  sendFeedback: (message: string) => request<FeedbackResponse>('POST', '/v1/feedback', { message }),

  debugDb: () => request<DebugDbResponse>('GET', '/v1/debug/db', undefined, true),
};
