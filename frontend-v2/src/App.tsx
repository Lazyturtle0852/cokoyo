// ページ全体
//
// 本番（shell = app）はアプリだけを画面いっぱいに出す。
// 説明用（shell = explain）は左にスマホ、右にデモ操作と通信の中身を並べる。

import { AdminGate } from './admin/AdminGate';
import { AppProvider } from './app/AppContext';
import { CallLog } from './demo/CallLog';
import { DbPanel } from './demo/DbPanel';
import { DemoPanel } from './demo/DemoPanel';
import { Phone } from './phone/Phone';
import { shell, useMockBackend } from './config';

function Explain() {
  return (
    <>
      <div className="masthead">
        <h1>COKOYO — 中で何が起きているか</h1>
        <p>
          本番（<span className="mono">/</span>）と同じ画面です。右にバックエンドとのやりとりを出しています。
          {useMockBackend
            ? 'このページはブラウザの中の模擬バックエンドで動いていて、フレンドも在校も偽物です。「デモ操作」でキャンパスの様子を変えられます。'
            : 'このページは本物のバックエンドにつながっていて、出ているのは実際のデータです。'}
        </p>
      </div>
      <div className="stage">
        <Phone />
        <div>
          <DemoPanel />
          <CallLog />
          <DbPanel />
        </div>
      </div>
    </>
  );
}

export function App() {
  if (shell === 'app') return <AppProvider><Phone /></AppProvider>;
  // 実データの説明画面（/explain）は、管理用パスワードで入った人にだけ見せる。
  // 模擬データ（/test）は誰でも触れる。
  // AppProvider は開いてから置く（入る前にアプリ側の通信を始めないため）。
  const page = <AppProvider><Explain /></AppProvider>;
  return useMockBackend ? page : <AdminGate title="COKOYO — 説明用ページ">{page}</AdminGate>;
}
