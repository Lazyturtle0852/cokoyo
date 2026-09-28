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

export type InApp = 'line' | 'instagram' | 'facebook' | 'other';

/** アプリの中のブラウザなら、その名前。ふつうのブラウザなら null */
export function inAppBrowser(): InApp | null {
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

const isAndroid = () => /Android/.test(navigator.userAgent);

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
