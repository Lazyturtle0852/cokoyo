// プッシュ通知（この端末に「YO！された」を知らせる）
//
// iPhone は、ホーム画面に追加したアプリとして開いたときだけ通知を使える（iOS 16.4 以降）。
// Safari のタブのままでは PushManager が無い。
// 通知の受け取りと表示は public/sw.js がやる。

import { api } from '../api/client';
import type { PushSubscriptionBody } from '../api/types';
import { isIOS, isStandalone } from './install';

export type PushSupport = 'ok' | 'ios-install' | 'unsupported';

export function pushSupport(): PushSupport {
  const ok = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (ok) return 'ok';
  return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
}

/** base64url の公開鍵を、subscribe が受け取る形にする */
function keyBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const toBody = (sub: PushSubscription) => sub.toJSON() as PushSubscriptionBody;

/**
 * この端末で通知をオンにした人。共用の端末で別の人がログインしたとき、
 * 前の人の購読を黙って引き継がないために覚えておく。
 */
const OWNER_KEY = 'cokoyo-push-owner:v1';
const readOwner = () => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } };
const writeOwner = (userId: string | null) => {
  try { if (userId) localStorage.setItem(OWNER_KEY, userId); else localStorage.removeItem(OWNER_KEY); } catch { /* 保存できない環境 */ }
};

async function registration() {
  return navigator.serviceWorker.ready;
}

/** この端末で、いまログインしている人が通知を受け取る設定になっているか */
export async function pushEnabled(userId: string): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted' || readOwner() !== userId) return false;
  return !!(await (await registration()).pushManager.getSubscription());
}

/** 通知をオンにする。許可されなかったら、画面に出す文で投げる */
export async function enablePush(publicKey: string, userId: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? '通知が許可されていません。端末やブラウザの設定で、COKOYOの通知を許可してください'
      : '通知を許可すると、オンにできます');
  }
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // サーバーの鍵が変わっていたら、古い購読では届かないので取り直す
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(publicKey)))) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api.subscribePush(toBody(sub));
  writeOwner(userId);
}

/** 通知をオフにする（ログアウトするときも呼ぶ）。失敗しても投げない */
export async function disablePush(): Promise<void> {
  writeOwner(null);
  try {
    if (pushSupport() !== 'ok') return;
    const sub = await (await registration()).pushManager.getSubscription();
    if (!sub) return;
    await api.unsubscribePush(sub.endpoint).catch(() => { /* サーバーに届かなくても、端末側は止める */ });
    await sub.unsubscribe();
  } catch { /* 通知を使えない環境 */ }
}

/**
 * 開いたときに、端末に残っている購読を確かめる。
 * オンにした本人なら、サーバーに知らせ直す（サーバー側で消えていても戻る）。
 * 別の人がログインしていたら、前の人の購読は解除する（共用の端末で他人の通知が出ないように）。
 * 「すべての端末からログアウト」のあとは、本人がもう一度オンにするまで送らない
 * （サーバーが宛先を消したことは、次にサーバーに知らせ直そうとしても分からないので、
 *   その操作をした端末では disablePush を呼び、ほかの端末は再ログインで owner と照らす）。
 */
export async function resyncPush(userId: string): Promise<void> {
  try {
    if (pushSupport() !== 'ok') return;
    const sub = await (await registration()).pushManager.getSubscription();
    if (!sub) return;
    const owner = readOwner();
    if (owner !== userId || Notification.permission !== 'granted') {
      await sub.unsubscribe();
      if (owner !== userId) writeOwner(null);
      return;
    }
    await api.subscribePush(toBody(sub));
  } catch { /* 次に開いたときにまた試す */ }
}
