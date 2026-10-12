// ホームに一度だけ出すお知らせ（見え方が広がる変更を、利用中の人に伝える）
//
// 「閉じる」を押すまで出す。新しいお知らせを出すときは KEY と中身を変える。

import { useState } from 'react';
import { useApp } from '../app/AppContext';

const KEY = 'cokoyo-news:2026-10-arrival:v1';
const readSeen = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export function NewsCard() {
  const { setTab } = useApp();
  const [seen, setSeen] = useState(readSeen);
  if (seen) return null;
  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* 保存できない環境 */ }
    setSeen(true);
  };
  return (
    <div className="card news-card" role="note">
      <p className="news-title">新しくできるようになったこと</p>
      <ul className="news-list">
        <li>あなたもフレンドもキャンパスにいるときは、フレンドの横の「YO！」で、あなたもキャンパスにいることをそのフレンドに知らせられます。</li>
        <li>設定で、スライムの色を選べます。YO！の通知もオンにできます。</li>
        <li>通知をオンにしていると、キャンパスに着いてまだポイントを獲得していない日に、1日1回お知らせします。そのため、オンのあいだは登録した端末がキャンパスのWiFiに見えるかを数分おきに確かめます（8〜19時）。</li>
      </ul>
      <div className="inline-actions">
        <button className="mini-btn primary" onClick={close}>OK</button>
        <button className="mini-btn" onClick={() => { close(); setTab('settings'); }}>設定をひらく</button>
      </div>
    </div>
  );
}
