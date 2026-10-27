// アプリの中のブラウザ（LINE・インスタなど）で開かれたかどうか
//
// LINE やインスタからリンクを開くと、そのアプリが持っている小さなブラウザで開く。
// これは Safari や Chrome とは別ものとして扱われるので、ふだん使っているブラウザで
// 登録ずみの人でも「はじめての登録」から始まってしまう。そのまま登録すると
// 同じ人のアカウントが2つできてしまい、フレンドの申請も片方にしか届かない。
//
// LINE だけは、リンクに openExternalBrowser=1 を足しておくと、ふだんのブラウザで
// 開いてくれる（src/config.ts の shareLink）。ほかのアプリにはその仕組みが無いので、
// 気づいてもらえるように案内を出す。

import { useMockBackend } from '../config';

export type InApp = 'line' | 'instagram' | 'facebook' | 'other';

/**
 * 練習用（/test/）でだけ、アプリの中のブラウザ・端末の種類を URL で決められる。
 * 運営者がパソコンから「インスタの中で開いた iPhone の人」の画面を確かめるため（/admin/insights/ のリンク）。
 *   ?inapp=instagram|line|facebook|other  &os=ios|android
 */
const preview = (name: 'inapp' | 'os') => {
  if (!useMockBackend || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
};
const isAndroid = () => (preview('os') ? preview('os') === 'android' : /Android/.test(navigator.userAgent));
const isIPhone = () => (preview('os') ? preview('os') === 'ios' : /iPhone|iPad|iPod/.test(navigator.userAgent));

/** アプリの中のブラウザなら、その名前。ふつうのブラウザなら null */
export function inAppBrowser(): InApp | null {
  const forced = preview('inapp');
  if (forced === 'line' || forced === 'instagram' || forced === 'facebook' || forced === 'other') return forced;
  const ua = navigator.userAgent;
  if (/\bLine\//i.test(ua)) return 'line';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV/i.test(ua)) return 'facebook';
  // iOS の Safari は Version/ を名乗る。名乗らない WebView はアプリの中のブラウザ
  if (/iPhone|iPad|iPod/.test(ua) && !/Version\/|CriOS|FxiOS|EdgiOS/.test(ua)) return 'other';
  return null;
}

export const inAppName = (kind: InApp) =>
  ({ line: 'LINE', instagram: 'インスタグラム', facebook: 'Facebook', other: 'ほかのアプリ' }[kind]);


/**
 * 「ふだん使っているブラウザ」がどれのことか。分からずに止まる人がいるので、名前で示す。
 * iPhone は Safari、Android は Chrome（ほかを使っている人もいるので「など」を付ける）。
 */
export function usualBrowser(): string {
  if (isAndroid()) return 'Androidなら「Chrome」など';
  if (isIPhone()) return 'iPhoneなら「Safari」など';
  return 'iPhoneなら「Safari」、Androidなら「Chrome」など';
}

/**
 * Android なら、同じURLを Chrome で開き直せる（intent:// でブラウザを指名できる）。
 * iPhone には同じ仕組みが無いので、手で開いてもらう。
 */
export function openInBrowserUrl(href: string): string | null {
  if (!isAndroid()) return null;
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`;
}

/** 「ふだんのブラウザで開く」やり方。端末とアプリで場所が違う */
export function howToOpen(kind: InApp): string {
  if (isAndroid()) return '右上の「⋮」から「ブラウザで開く」を押してください';
  if (kind === 'line') return '右下の「⋯」（またはメニュー）から「Safariで開く」を押してください';
  if (kind === 'instagram') return '右上の「⋯」から「ブラウザで開く」を押してください';
  return '画面のメニューから「Safariで開く」を押してください';
}
