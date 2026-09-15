// ページ全体：左にスマホ、右にデモ操作と通信の中身

import { AppProvider } from './app/AppContext';
import { CallLog } from './demo/CallLog';
import { DemoPanel } from './demo/DemoPanel';
import { Phone } from './phone/Phone';

export function App() {
  return (
    <AppProvider>
      <div className="masthead">
        <h1>COKOYO（仮称）アプリのモック</h1>
        <p>9月15日にグループで決めた仕様の画面です（React）。バックエンドが未接続のときは、ブラウザの中の模擬バックエンドで動きます。右の「デモ操作」でキャンパスの様子を変えられます。</p>
      </div>
      <div className="stage">
        <Phone />
        <div>
          <DemoPanel />
          <CallLog />
        </div>
      </div>
    </AppProvider>
  );
}
