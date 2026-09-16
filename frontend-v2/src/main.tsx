import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { shell } from './config';
import './styles.css';

// 本番はスマホ枠を外して画面いっぱいに出す（styles.css の body.plain）
if (shell === 'app') document.body.classList.add('plain');

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
