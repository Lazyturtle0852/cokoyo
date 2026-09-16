/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 本物のバックエンドのURL。空なら模擬バックエンドを使う */
  readonly VITE_API_BASE_URL?: string;
  /** QRコードと招待リンクの形 */
  readonly VITE_SHARE_LINK_BASE?: string;
  /** ページの外枠。app なら本番（スマホ枠なし・説明なし）。既定は explain */
  readonly VITE_SHELL?: 'app' | 'explain';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
