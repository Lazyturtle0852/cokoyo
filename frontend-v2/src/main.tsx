import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { shell } from './config';
import './styles.css';

// 本番はスマホ枠を外して画面いっぱいに出す（styles.css の body.plain）
if (shell === 'app') document.body.classList.add('plain');

// ホーム画面に追加できるようにする（src/app/install.ts と public/sw.js）。
// 画面を出す邪魔をしないよう、読み込みが終わってから登録する。
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', window.location.href), { scope: './' })
      .catch(() => { /* 登録できなくても、ふつうのサイトとして動く */ });
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
