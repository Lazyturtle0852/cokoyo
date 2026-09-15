// スマホの画面（枠・ステータスバー・画面の切り替え・タブ・シート・トースト）

import { useEffect, useState } from 'react';
import { useApp, type Tab } from '../app/AppContext';
import { AddFriendSheet } from './AddFriendSheet';
import { FieldView } from './FieldView';
import { Friends } from './Friends';
import { Home } from './Home';
import { Onboarding } from './Onboarding';
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
  const { tab, setTab, friends } = useApp();
  const badge = friends ? friends.requests.incoming.length + friends.friends.filter((f) => f.best === 'incoming').length : 0;
  return (
    <>
      <div className="appbar">
        <div className="wordmark">COK<span>O</span>YO</div>
        <TotalPoints />
      </div>
      {/* ホームのフィールドはスクロールさせず、下のカードだけをスクロールする */}
      {tab === 'home' && <FieldView />}
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
  const { view, error, screenRef, toast, restart, onboardingMode } = useApp();
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
            {view === 'error' && (
              <div className="content center-note">
                <p className="err-title">バックエンドに接続できません</p>
                <p className="err-body">{error}</p>
                <button className="btn btn-quiet" onClick={() => void restart()}>もう一度試す</button>
              </div>
            )}
            {view === 'onboarding' && <Onboarding key={onboardingMode} />}
            {view === 'app' && <AppScreens />}
          </div>
          <AddFriendSheet />
          {toast && <div className="toast show" key={toast.id} role="status" aria-live="polite">{toast.message}</div>}
        </div>
      </div>
      <p className="device-caption">あなたのスマホ</p>
    </div>
  );
}
