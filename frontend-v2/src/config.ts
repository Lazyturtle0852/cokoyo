// 接続先と、ページの外枠の設定
//
// バックエンドのURLは次の順で決まる。どれもなければ、ブラウザの中の模擬バックエンドを使う。
//   1. ページのURLの ?api=<URL>        例）http://localhost:5173/?api=http://localhost:8080
//   2. 環境変数 VITE_API_BASE_URL       例）app/.env.local に VITE_API_BASE_URL=http://localhost:8080
//
// 外枠は2種類ある。
//   app     … スマホ枠も説明も無し。画面いっぱいにアプリだけ。本番（/）で使う。
//   explain … スマホ枠・デモ操作・通信の中身つき。説明用（/explain と /test）。
// 開発中は explain のまま動かしたいので、こちらを既定にしてある。
// 本番のビルドだけ VITE_SHELL=app を渡す（deploy/update.sh）。?shell=app でも切り替えられる。

const query = (name: string) => {
  try { return new URLSearchParams(window.location.search).get(name) ?? ''; } catch { return ''; }
};

export const config = {
  apiBaseUrl: query('api') || import.meta.env.VITE_API_BASE_URL || '',
};

/**
 * 招待リンク。今いるページ（/ ・ /explain/ ・ /test/）のURLに ?add=<共有キー> を足す。
 * 配った先でも同じビルドに戻ってくるので、本番のドメインを埋め込む必要がない。
 * 開発中の ?api= などもそのまま残るので、手元でも受け取り側を試せる。
 * 受け取る側は src/app/invite.ts。
 */
export const shareLink = (shareKey: string) => {
  try {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('add', shareKey);
    return url.toString();
  } catch { return `?add=${shareKey}`; }
};

export const useMockBackend = !config.apiBaseUrl;

export type Shell = 'app' | 'explain';
export const shell: Shell =
  (query('shell') || import.meta.env.VITE_SHELL) === 'app' ? 'app' : 'explain';
