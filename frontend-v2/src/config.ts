// 接続先の設定
//
// バックエンドのURLは次の順で決まる。どれもなければ、ブラウザの中の模擬バックエンドを使う。
//   1. ページのURLの ?api=<URL>        例）http://localhost:5173/?api=http://localhost:8080
//   2. 環境変数 VITE_API_BASE_URL       例）app/.env.local に VITE_API_BASE_URL=http://localhost:8080

const fromQuery = (() => {
  try { return new URLSearchParams(window.location.search).get('api') ?? ''; } catch { return ''; }
})();

export const config = {
  apiBaseUrl: fromQuery || import.meta.env.VITE_API_BASE_URL || '',
  // 本番のドメインが決まったら変える
  shareLinkBase: import.meta.env.VITE_SHARE_LINK_BASE || 'https://cokoyo.example/add/',
};

export const useMockBackend = !config.apiBaseUrl;
