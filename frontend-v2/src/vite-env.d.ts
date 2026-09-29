/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 本物のバックエンドのURL。空なら模擬バックエンドを使う */
  readonly VITE_API_BASE_URL?: string;
  /** ページの外枠。app なら本番（スマホ枠なし・説明なし）。既定は explain */
  readonly VITE_SHELL?: 'app' | 'explain';
  /** 問い合わせの Google フォームのURL。空なら src/config.ts の既定のもの */
  readonly VITE_FEEDBACK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
