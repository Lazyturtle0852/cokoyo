import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useMockBackend } from '../config';
import { AdminGate } from './AdminGate';
import { Dashboard } from './Dashboard';
import '../styles.css';

// 管理画面（/admin/）。アプリ本体とは別の入口。
// 模擬バックエンドには集計が無いので、実 API につながっているときだけ動く。
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {useMockBackend ? (
      <div className="gate">
        <div className="panel gate-card">
          <h2>COKOYO（仮称）— 管理画面</h2>
          <p className="desc">
            管理画面は本物のバックエンドにつないだときだけ使えます。手元では
            <span className="mono">/admin/?api=/api</span> で開いてください。
          </p>
        </div>
      </div>
    ) : (
      <AdminGate title="COKOYO（仮称）— 管理画面"><Dashboard /></AdminGate>
    )}
  </StrictMode>,
);
