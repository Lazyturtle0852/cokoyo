import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 公開用に1ファイルへまとめるとき（tools/build-app-share.js）、相対パスのほうが扱いやすい
  base: './',
  server: { port: 5173 },
});
