import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useMockBackend } from '../config';
import { AdminGate } from './AdminGate';
import { Insights } from './Insights';
import '../styles.css';

// 分析（/admin/insights/）。管理画面と同じパスワードで入る、運営者向けのページ。
// 模擬バックエンドには集計が無いので、実 API につながっているときだけ動く。
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {useMockBackend ? (
      <div className="gate">
        <div className="panel gate-card">
          <h2>COKOYO — 分析</h2>
          <p className="desc">本物のバックエンドにつないだときだけ使えます。手元では <span className="mono">/admin/insights/?api=/api</span> で開いてください。</p>
        </div>
      </div>
    ) : (
      <AdminGate title="COKOYO — 分析"><Insights /></AdminGate>
    )}
  </StrictMode>,
);
