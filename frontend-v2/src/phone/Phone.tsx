// スマホの画面（枠・ステータスバー・画面の切り替え・タブ・シート・トースト）

import { useEffect, useState } from 'react';
import { useApp, type Tab } from '../app/AppContext';
import { AddFriendSheet } from './AddFriendSheet';
import { CampusMap } from './CampusMap';
import { FieldView } from './FieldView';
import { Friends } from './Friends';
import { Home } from './Home';
import { Onboarding } from './Onboarding';
import { api } from '../api/client';
import { inAppBrowser } from '../app/browser';
import { InAppNotice } from './InAppNotice';
import { Settings } from './Settings';
import { TotalPoints } from './TotalPoints';
import { Icon } from './ui';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(t); }, []);
  return <span>{now.getHours()}:{String(now.getMinutes()).padStart(2, '0')}</span>;
}

const TABS: { id: Tab; label: string; icon: () => React.JSX.Element }[] = [
  { id: 'home', label: 'ホーム', icon: Icon.Home },
  { id: 'friends', label: 'フレンド', icon: () => <Icon.Friends /> },
  { id: 'settings', label: '設定', icon: Icon.Settings },
];

function AppScreens() {
  const { tab, setTab, friends, mapOpen } = useApp();
  const badge = friends ? friends.requests.incoming.length + friends.friends.filter((f) => f.best === 'incoming').length : 0;
  return (
    <>
      <div className="appbar">
        <div className="wordmark">COK<span>O</span>YO</div>
        <TotalPoints />
      </div>
      {/* ホームのフィールドはスクロールさせず、下のカードだけをスクロールする */}
      {/* 地図を開いている間は外す（右上の「地図」ボタンが地図の上に残るため） */}
      {tab === 'home' && !mapOpen && <FieldView />}
      {/* タブごとに作り直して、スクロール位置を一番上に戻す */}
      <div className={`content${tab === 'home' ? ' under-field' : ''}`} key={tab}>
        {tab === 'home' ? <Home /> : tab === 'friends' ? <Friends /> : <Settings />}
      </div>
      <nav className="tabs" aria-label="画面の切り替え">
        {TABS.map(({ id, label, icon: TabIcon }) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <span className="tabicon"><TabIcon />{id === 'friends' && badge > 0 && <span className="dot">{badge}</span>}</span>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}

export function Phone() {
  const { view, error, screenRef, toast, restart, mapOpen } = useApp();
  return (
    <div className="device-col">
      <div className="device">
        <div className="screen" ref={screenRef}>
          <div className="statusbar">
            <Clock />
            <span className="icons" aria-hidden="true">
              <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
              <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x=".5" y=".5" width="21" height="11" rx="3.2" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" /><path d="M23 4v4a2.2 2.2 0 0 0 0-4z" fill="currentColor" opacity=".4" /></svg>
            </span>
          </div>
          <div className="view">
            {view === 'loading' && <div className="center-note">読み込み中…</div>}
            {view === 'login' && (
              <div className="content ob ob-welcome">
                <div className="ob-hero"><div className="wordmark big">COK<span>O</span>YO</div><h2>フレンドがキャンパスにいるか、<br />ボタンひとつで分かる</h2></div>
                <ul className="ob-list">
                  <li><span className="ob-ico"><Icon.Wifi /></span><span><b>位置情報は使いません</b>キャンパスのWiFiにつながっているかだけを見ます</span></li>
                  <li><span className="ob-ico best"><Icon.Friends size={18} /></span><span><b>見せる範囲は相手ごと</b>ベストフレンドにだけ建物まで。ブロックした相手には見えません</span></li>
                  <li><span className="ob-ico hide"><Icon.Hide /></span><span><b>いつでも隠れられます</b>かくれんぼ中は、フレンド全員から「いません」に見えます</span></li>
                </ul>
                {inAppBrowser() ? <InAppNotice /> : (
                  <div className="login">
                    <button className="btn btn-primary" onClick={api.beginLogin}>keio.jp のGoogleでログイン</button>
                    {/* Googleの画面には、アプリ名ではなくこのアプリが動いている住所が出ることがある。
                        「何にログインするのか」が分からないと不安なので、先に書いておく。 */}
                    <p className="login-note">
                      ログインする先は、このアプリ <b>COKOYO</b> です。
                      Googleの画面や iPhone の確認に <span className="mono">cokoyo.lazyta-toru.net</span>
                      （COKOYOが動いている住所）が出ますが、そのまま進めて大丈夫です。
                    </p>
                    <p className="login-note muted">パスワードをこのアプリに渡すことはありません。Googleの画面で入力します。</p>
                  </div>
                )}
                {/* 相対パスにしてあるので、/explain/ と /test/ でも同じビルドの中のページが開く */}
                <p className="login-note legal">
                  ログインすると、<a href="./terms/">利用規約</a>と<a href="./privacy/">プライバシーポリシー</a>に同意したものとみなします。
                  COKOYOは実験を兼ねた試作品です（<a href="./about/">COKOYOについて</a>）。
                </p>
              </div>
            )}
            {view === 'error' && (
              <div className="content center-note">
                <p className="err-title">バックエンドに接続できません</p>
                <p className="err-body">{error}</p>
                <button className="btn btn-quiet" onClick={() => void restart()}>もう一度試す</button>
              </div>
            )}
            {view === 'onboarding' && <Onboarding />}
            {view === 'app' && <AppScreens />}
          </div>
          {view === 'app' && mapOpen && <CampusMap />}
          <AddFriendSheet />
          {toast && <div className="toast show" key={toast.id} role="status" aria-live="polite">{toast.message}</div>}
        </div>
      </div>
      <p className="device-caption">あなたのスマホ</p>
    </div>
  );
}
