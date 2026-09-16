import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// @types/node を入れずに済ませるための最小の宣言
declare const process: { env: Record<string, string | undefined> };

// 本番のビルド（VITE_SHELL=app）だけタイトルを変える。
// index.html は説明用の名前で書いてあるので、本番ぶんはここで差し替える。
const isApp = process.env.VITE_SHELL === 'app';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'cokoyo-title',
      transformIndexHtml: (html: string) =>
        isApp ? html.replace(/<title>.*<\/title>/, '<title>COKOYO（仮称）</title>') : html,
    },
  ],
  // 公開用に1ファイルへまとめるとき（tools/build-app-share.js）、相対パスのほうが扱いやすい
  base: './',
  // 開発中は /api をローカルのバックエンドへ流す。同一オリジンになるので CORS が要らない。
  //   端末A: cd backend && npm run dev     （http://localhost:8080）
  //   端末B: cd frontend-v2 && npm run dev → http://localhost:5173/?api=/api
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true } },
  },
});
