import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { shell } from './config';
import './styles.css';

// 本番はスマホ枠を外して画面いっぱいに出す（styles.css の body.plain）
if (shell === 'app') document.body.classList.add('plain');

// ホーム画面に追加できるようにする（src/app/install.ts と public/sw.js）。
// 画面を出す邪魔をしないよう、読み込みが終わってから登録する。
// URL にビルドの印を付けるのは、Cloudflare が sw.js を何時間も控えて古い版を返すため（2026-10-12）。
// URL が変われば控えは使われず、新しい sw.js が入る。
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    const url = new URL('sw.js', window.location.href);
    url.searchParams.set('v', __BUILD_ID__);
    void navigator.serviceWorker.register(url, { scope: './', updateViaCache: 'none' })
      .catch(() => { /* 登録できなくても、ふつうのサイトとして動く */ });
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
